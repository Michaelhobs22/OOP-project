import { Product, BarcodeType } from '../entities/Product.entity';
import { Inventory } from '../entities/Inventory.entity';
import { ProductRepository } from '../repositories/ProductRepository';
import { CacheService } from './CacheService';
import { BarcodeDecoderService } from './BarcodeDecoderService';

export interface CreateProductDto {
  barcode: string;
  barcodeType: BarcodeType;
  name: string;
  description?: string;
  sku?: string;
  categoryId?: string;
  manufacturer?: string;
  priceUsd?: number;
  costUsd?: number;
  imageUrl?: string;
  supplierId?: string;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  priceUsd?: number;
  costUsd?: number;
  imageUrl?: string;
  isActive?: boolean;
}

export class ProductService {
  private productRepository: ProductRepository;
  private cacheService: CacheService;
  private barcodeService: BarcodeDecoderService;
  private cacheTtl: number = 3600; // 1 hour

  constructor(
    productRepository: ProductRepository,
    cacheService: CacheService,
    barcodeService: BarcodeDecoderService
  ) {
    this.productRepository = productRepository;
    this.cacheService = cacheService;
    this.barcodeService = barcodeService;
  }

  /**
   * Create new product
   * @param dto - Product creation data
   * @param userId - User ID creating the product
   * @returns Promise<Product>
   */
  async createProduct(dto: CreateProductDto, userId: string): Promise<Product> {
    // Validate barcode doesn't exist
    const existingProduct = await this.productRepository.findByBarcode(
      dto.barcode
    );
    if (existingProduct) {
      throw new Error(
        `Product with barcode ${dto.barcode} already exists (ID: ${existingProduct.id})`
      );
    }

    // Validate SKU if provided
    if (dto.sku) {
      const existingBySku = await this.productRepository.findBySku(dto.sku);
      if (existingBySku) {
        throw new Error(`Product with SKU ${dto.sku} already exists`);
      }
    }

    // Validate barcode format
    const decoded = this.barcodeService.decode(dto.barcode);
    if (!decoded.isValid && decoded.format !== 'UNKNOWN') {
      console.warn(
        `Warning: Barcode ${dto.barcode} failed validation but was accepted`
      );
    }

    // Create product entity
    const product = new Product();
    product.barcode = this.barcodeService.normalize(dto.barcode);
    product.barcodeType = dto.barcodeType;
    product.name = dto.name;
    product.description = dto.description || null;
    product.sku = dto.sku || null;
    product.manufacturer = dto.manufacturer || null;
    product.priceUsd = dto.priceUsd || 0;
    product.costUsd = dto.costUsd || 0;
    product.imageUrl = dto.imageUrl || null;
    product.createdBy = { id: userId } as any;

    // Save product
    const savedProduct = await this.productRepository.create(product);

    // Create inventory record
    const inventory = new Inventory();
    inventory.product = savedProduct;
    inventory.quantityOnHand = 0;
    inventory.quantityReserved = 0;
    inventory.reorderLevel = 10;
    inventory.reorderQuantity = 50;
    // Save inventory (assume inventoryRepository available)

    // Invalidate cache
    await this.cacheService.deleteByPattern('products:*');
    await this.cacheService.deleteByPattern('search:*');

    return savedProduct;
  }

  /**
   * Get product by ID with caching
   * @param id - Product ID
   * @returns Promise<Product | null>
   */
  async getProductById(id: string): Promise<Product | null> {
    const cacheKey = `product:${id}`;

    return this.cacheService.getOrSet(cacheKey, async () => {
      return this.productRepository.findWithRelations(id);
    });
  }

  /**
   * Get product by barcode with caching
   * @param barcode - Product barcode
   * @returns Promise<Product | null>
   */
  async getProductByBarcode(barcode: string): Promise<Product | null> {
    const normalized = this.barcodeService.normalize(barcode);
    const cacheKey = `product:barcode:${normalized}`;

    return this.cacheService.getOrSet(cacheKey, async () => {
      return this.productRepository.findByBarcode(normalized);
    });
  }

  /**
   * Update product
   * @param id - Product ID
   * @param dto - Update data
   * @returns Promise<Product | null>
   */
  async updateProduct(id: string, dto: UpdateProductDto): Promise<Product | null> {
    // Validate product exists
    const product = await this.getProductById(id);
    if (!product) {
      throw new Error(`Product with ID ${id} not found`);
    }

    // Update fields
    const updateData: any = {
      ...dto,
      updatedAt: new Date(),
    };

    const updated = await this.productRepository.update(id, updateData);

    // Invalidate cache
    await this.cacheService.delete(`product:${id}`);
    await this.cacheService.delete(`product:barcode:${product.barcode}`);
    await this.cacheService.deleteByPattern('products:*');

    return updated;
  }

  /**
   * Search products by term
   * @param searchTerm - Search keyword
   * @param limit - Max results
   * @returns Promise<Product[]>
   */
  async searchProducts(searchTerm: string, limit: number = 20): Promise<Product[]> {
    const cacheKey = `search:${searchTerm}:${limit}`;

    return this.cacheService.getOrSet(cacheKey, async () => {
      return this.productRepository.searchByTerm(searchTerm, limit);
    });
  }

  /**
   * Get all products (paginated)
   * @param page - Page number
   * @param limit - Items per page
   * @returns Promise<{ data: Product[], total: number, pages: number }>
   */
  async getAllProducts(
    page: number = 1,
    limit: number = 10
  ): Promise<{ data: Product[]; total: number; page: number; pages: number }> {
    return this.productRepository.findPaginated(page, limit, {
      isActive: true,
    });
  }

  /**
   * Get low stock products
   * @returns Promise<Product[]>
   */
  async getLowStockProducts(): Promise<Product[]> {
    const cacheKey = 'products:low-stock';

    return this.cacheService.getOrSet(cacheKey, async () => {
      return this.productRepository.findLowStock();
    });
  }

  /**
   * Delete product (soft delete)
   * @param id - Product ID
   * @returns Promise<boolean>
   */
  async deleteProduct(id: string): Promise<boolean> {
    const product = await this.getProductById(id);
    if (!product) {
      throw new Error(`Product with ID ${id} not found`);
    }

    const result = await this.productRepository.update(id, {
      isActive: false,
    } as any);

    // Invalidate cache
    await this.cacheService.delete(`product:${id}`);
    await this.cacheService.delete(`product:barcode:${product.barcode}`);
    await this.cacheService.deleteByPattern('products:*');

    return !!result;
  }

  /**
   * Get product statistics
   * @returns Promise<{ totalProducts: number, activeProducts: number, avgPrice: number }>
   */
  async getProductStats(): Promise<any> {
    const cacheKey = 'stats:products';

    return this.cacheService.getOrSet(cacheKey, async () => {
      const totalProducts = await this.productRepository.countActive();
      // Add more stats calculation here

      return {
        totalProducts,
        generatedAt: new Date(),
      };
    });
  }

  /**
   * Bulk import products
   * @param products - Array of product data
   * @param userId - User ID
   * @returns Promise<{ created: number, failed: number, errors: any[] }>
   */
  async bulkImportProducts(
    products: CreateProductDto[],
    userId: string
  ): Promise<{ created: number; failed: number; errors: any[] }> {
    const result = { created: 0, failed: 0, errors: [] as any[] };

    for (const productDto of products) {
      try {
        await this.createProduct(productDto, userId);
        result.created++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          barcode: productDto.barcode,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  /**
   * Get margin analysis for product
   * @param id - Product ID
   * @returns Promise<{ id: string, margin: number, marginPercent: number }>
   */
  async getProductMargin(id: string): Promise<any> {
    const product = await this.getProductById(id);
    if (!product) {
      throw new Error(`Product with ID ${id} not found`);
    }

    const margin = product.priceUsd - product.costUsd;
    const marginPercent = product.getMarginPercentage();

    return {
      id,
      margin,
      marginPercent,
    };
  }
}
