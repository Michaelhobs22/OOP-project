import { Request, Response } from 'express';
import { ProductService, CreateProductDto, UpdateProductDto } from '../services/ProductService';

export class ProductController {
  private productService: ProductService;

  constructor(productService: ProductService) {
    this.productService = productService;
  }

  /**
   * POST /api/products
   * Create new product
   */
  async createProduct(req: Request, res: Response): Promise<void> {
    try {
      const { barcode, barcodeType, name, description, sku, categoryId, priceUsd, costUsd, imageUrl } = req.body;
      const userId = req.user?.id; // From JWT middleware

      // Validation
      if (!barcode || !name || !barcodeType) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: barcode, name, barcodeType',
        });
        return;
      }

      const dto: CreateProductDto = {
        barcode,
        barcodeType,
        name,
        description,
        sku,
        categoryId,
        priceUsd,
        costUsd,
        imageUrl,
      };

      const product = await this.productService.createProduct(dto, userId);

      res.status(201).json({
        success: true,
        data: product,
        message: 'Product created successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error creating product',
      });
    }
  }

  /**
   * GET /api/products
   * List all products (paginated)
   */
  async listProducts(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (page < 1 || limit < 1 || limit > 100) {
        res.status(400).json({
          success: false,
          error: 'Invalid pagination parameters',
        });
        return;
      }

      const result = await this.productService.getAllProducts(page, limit);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit,
          total: result.total,
          pages: result.pages,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error fetching products',
      });
    }
  }

  /**
   * GET /api/products/:id
   * Get product by ID
   */
  async getProduct(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const product = await this.productService.getProductById(id);

      if (!product) {
        res.status(404).json({
          success: false,
          error: 'Product not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error fetching product',
      });
    }
  }

  /**
   * GET /api/products/barcode/:barcode
   * Get product by barcode
   */
  async getProductByBarcode(req: Request, res: Response): Promise<void> {
    try {
      const { barcode } = req.params;

      if (!barcode) {
        res.status(400).json({
          success: false,
          error: 'Barcode is required',
        });
        return;
      }

      const product = await this.productService.getProductByBarcode(barcode);

      if (!product) {
        res.status(404).json({
          success: false,
          error: 'Product not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error fetching product',
      });
    }
  }

  /**
   * PUT /api/products/:id
   * Update product
   */
  async updateProduct(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const dto: UpdateProductDto = req.body;

      const product = await this.productService.updateProduct(id, dto);

      if (!product) {
        res.status(404).json({
          success: false,
          error: 'Product not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product,
        message: 'Product updated successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error updating product',
      });
    }
  }

  /**
   * DELETE /api/products/:id
   * Delete (soft delete) product
   */
  async deleteProduct(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const deleted = await this.productService.deleteProduct(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Product not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Product deleted successfully',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error deleting product',
      });
    }
  }

  /**
   * GET /api/products/search
   * Search products by term
   */
  async searchProducts(req: Request, res: Response): Promise<void> {
    try {
      const { q, limit } = req.query;

      if (!q || typeof q !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Search term (q) is required',
        });
        return;
      }

      const searchLimit = limit ? Math.min(parseInt(limit as string), 100) : 20;
      const products = await this.productService.searchProducts(q, searchLimit);

      res.status(200).json({
        success: true,
        data: products,
        count: products.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error searching products',
      });
    }
  }

  /**
   * GET /api/products/inventory/low-stock
   * Get low stock products
   */
  async getLowStock(req: Request, res: Response): Promise<void> {
    try {
      const products = await this.productService.getLowStockProducts();

      res.status(200).json({
        success: true,
        data: products,
        count: products.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error fetching low stock products',
      });
    }
  }

  /**
   * POST /api/products/bulk-import
   * Bulk import products from CSV/JSON
   */
  async bulkImport(req: Request, res: Response): Promise<void> {
    try {
      const { products } = req.body;
      const userId = req.user?.id;

      if (!Array.isArray(products) || products.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Products array is required',
        });
        return;
      }

      const result = await this.productService.bulkImportProducts(
        products as CreateProductDto[],
        userId
      );

      res.status(200).json({
        success: true,
        data: result,
        message: `Imported ${result.created} products, ${result.failed} failed`,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error importing products',
      });
    }
  }

  /**
   * GET /api/products/stats
   * Get product statistics
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.productService.getProductStats();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Error fetching statistics',
      });
    }
  }

  /**
   * GET /api/products/:id/margin
   * Get margin analysis for product
   */
  async getMargin(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const margin = await this.productService.getProductMargin(id);

      res.status(200).json({
        success: true,
        data: margin,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Error calculating margin',
      });
    }
  }
}
