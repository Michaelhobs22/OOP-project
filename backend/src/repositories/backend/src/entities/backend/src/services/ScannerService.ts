import { Product } from '../entities/Product.entity';
import { Inventory } from '../entities/Inventory.entity';
import { ScanLog } from '../entities/ScanLog.entity';
import { ProductService } from './ProductService';
import { BarcodeDecoderService, DecodedBarcode } from './BarcodeDecoderService';
import { CacheService } from './CacheService';

export interface ScanDecodeRequest {
  barcode: string;
  deviceId?: string;
  location?: string;
  timestamp?: Date;
}

export interface ScanDecodeResponse {
  success: boolean;
  product?: Product | null;
  barcode: DecodedBarcode;
  cached: boolean;
  message?: string;
}

export interface QuickAddRequest {
  barcode: string;
  quantity: number;
  location?: string;
  deviceId?: string;
}

export interface QuickAddResponse {
  success: boolean;
  product?: Product;
  quantity: number;
  newStock: number;
  message: string;
}

export class ScannerService {
  private productService: ProductService;
  private barcodeService: BarcodeDecoderService;
  private cacheService: CacheService;
  private scanLogRepository: any; // Assume scanlog repo injected

  constructor(
    productService: ProductService,
    barcodeService: BarcodeDecoderService,
    cacheService: CacheService,
    scanLogRepository: any
  ) {
    this.productService = productService;
    this.barcodeService = barcodeService;
    this.cacheService = cacheService;
    this.scanLogRepository = scanLogRepository;
  }

  /**
   * Decode barcode and return product details
   * @param request - Scan decode request
   * @returns Promise<ScanDecodeResponse>
   */
  async decodeScan(request: ScanDecodeRequest): Promise<ScanDecodeResponse> {
    try {
      // Decode the barcode format
      const decoded = this.barcodeService.decode(request.barcode);

      // Try to find product by barcode
      let product: Product | null = null;
      let cached = false;

      // Check cache first
      const cacheKey = `scan:product:${decoded.rawValue}`;
      const cachedProduct = await this.cacheService.get<Product>(cacheKey);

      if (cachedProduct) {
        product = cachedProduct;
        cached = true;
      } else {
        // Query database
        product = await this.productService.getProductByBarcode(
          decoded.rawValue
        );

        // Cache result for 30 minutes
        if (product) {
          await this.cacheService.set(cacheKey, product, { ttl: 1800 });
        }
      }

      // Log the scan
      await this.logScan({
        product,
        barcode: request.barcode,
        scanType: 'lookup',
        deviceId: request.deviceId,
        location: request.location,
        decodedData: decoded,
      });

      return {
        success: !!product,
        product,
        barcode: decoded,
        cached,
        message: product
          ? 'Product found'
          : 'Barcode decoded but product not in database',
      };
    } catch (error) {
      return {
        success: false,
        barcode: this.barcodeService.decode(request.barcode),
        cached: false,
        message: `Error decoding scan: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Quick add: Decode barcode, find product, add to inventory
   * @param request - Quick add request
   * @param userId - User ID performing action
   * @returns Promise<QuickAddResponse>
   */
  async quickAdd(
    request: QuickAddRequest,
    userId: string
  ): Promise<QuickAddResponse> {
    try {
      // Find product
      const product = await this.productService.getProductByBarcode(
        request.barcode
      );

      if (!product) {
        return {
          success: false,
          quantity: request.quantity,
          newStock: 0,
          message: `Product with barcode ${request.barcode} not found`,
        };
      }

      if (!product.inventory) {
        return {
          success: false,
          product,
          quantity: request.quantity,
          newStock: 0,
          message: 'Inventory record not found for product',
        };
      }

      // Add stock
      try {
        product.inventory.addStock(request.quantity);
      } catch (err) {
        return {
          success: false,
          product,
          quantity: request.quantity,
          newStock: product.inventory.quantityOnHand,
          message: `Error adding stock: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }

      // Persist inventory change
      // await inventoryRepository.save(product.inventory);

      // Log the transaction
      await this.logScan({
        product,
        barcode: request.barcode,
        scanType: 'add',
        deviceId: request.deviceId,
        location: request.location,
        quantity: request.quantity,
        userId,
      });

      // Invalidate cache
      await this.cacheService.delete(`product:${product.id}`);
      await this.cacheService.delete(`product:barcode:${product.barcode}`);

      return {
        success: true,
        product,
        quantity: request.quantity,
        newStock: product.inventory.quantityOnHand,
        message: `Successfully added ${request.quantity} units of ${product.name}`,
      };
    } catch (error) {
      return {
        success: false,
        quantity: request.quantity,
        newStock: 0,
        message: `Error in quick add: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Receive inventory via scanning
   * @param barcode - Product barcode
   * @param quantity - Quantity received
   * @param supplierId - Supplier ID
   * @param userId - User ID
   * @returns Promise<QuickAddResponse>
   */
  async receiveInventory(
    barcode: string,
    quantity: number,
    supplierId?: string,
    userId?: string
  ): Promise<QuickAddResponse> {
    try {
      const product = await this.productService.getProductByBarcode(barcode);

      if (!product) {
        return {
          success: false,
          quantity,
          newStock: 0,
          message: `Product not found`,
        };
      }

      if (!product.inventory) {
        return {
          success: false,
          product,
          quantity,
          newStock: 0,
          message: 'Inventory record missing',
        };
      }

      product.inventory.addStock(quantity);

      // Log as receive transaction
      await this.logScan({
        product,
        barcode,
        scanType: 'receive',
        quantity,
        userId,
      });

      return {
        success: true,
        product,
        quantity,
        newStock: product.inventory.quantityOnHand,
        message: `Received ${quantity} units`,
      };
    } catch (error) {
      return {
        success: false,
        quantity,
        newStock: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Batch scan processing
   * @param barcodes - Array of barcodes
   * @param operation - Operation type (lookup, add, receive, count)
   * @param quantity - Quantity per scan (if add/receive)
   * @returns Promise<any>
   */
  async batchScan(
    barcodes: string[],
    operation: 'lookup' | 'add' | 'receive' | 'count',
    quantity?: number
  ): Promise<any> {
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      items: [] as any[],
    };

    for (const barcode of barcodes) {
      try {
        let itemResult: any;

        if (operation === 'lookup') {
          itemResult = await this.decodeScan({ barcode });
        } else if (operation === 'add' && quantity) {
          itemResult = await this.quickAdd(
            { barcode, quantity },
            'batch-user'
          );
        } else if (operation === 'receive' && quantity) {
          itemResult = await this.receiveInventory(barcode, quantity);
        }

        results.items.push(itemResult);
        results.processed++;

        if (itemResult.success) {
          results.succeeded++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.items.push({
          barcode,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get recent scan history
   * @param limit - Number of recent scans
   * @returns Promise<ScanLog[]>
   */
  async getScanHistory(limit: number = 50): Promise<any[]> {
    try {
      return await this.scanLogRepository.findPaginated(1, limit);
    } catch (error) {
      console.error('Error fetching scan history:', error);
      return [];
    }
  }

  /**
   * Log a scan event
   * @param data - Scan log data
   */
  private async logScan(data: any): Promise<void> {
    try {
      const scanLog = {
        product: data.product,
        barcodeScanned: data.barcode,
        scanType: data.scanType,
        deviceId: data.deviceId,
        location: data.location,
        userId: data.userId,
        confidenceScore: data.decodedData?.confidence,
        rawData: {
          decoded: data.decodedData,
          quantity: data.quantity,
        },
        scanTimestamp: new Date(),
      };

      // Save to database
      // await this.scanLogRepository.create(scanLog);

      // Also increment scan counter in cache
      await this.cacheService.increment('metrics:total-scans');
      await this.cacheService.increment(
        `metrics:scans:${data.scanType}`,
        1
      );
    } catch (error) {
      console.error('Error logging scan:', error);
    }
  }

  /**
   * Get scan statistics
   * @returns Promise<any>
   */
  async getScanStats(): Promise<any> {
    const cacheKey = 'metrics:scan-stats';

    return this.cacheService.getOrSet(cacheKey, async () => {
      const totalScans = await this.cacheService.get('metrics:total-scans');
      const lookups = await this.cacheService.get('metrics:scans:lookup');
      const adds = await this.cacheService.get('metrics:scans:add');
      const receives = await this.cacheService.get('metrics:scans:receive');

      return {
        totalScans: totalScans || 0,
        lookups: lookups || 0,
        adds: adds || 0,
        receives: receives || 0,
        timestamp: new Date(),
      };
    });
  }
}
