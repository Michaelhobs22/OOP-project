import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User.entity';
import { Category } from './Category.entity';
import { Supplier } from './Supplier.entity';
import { Inventory } from './Inventory.entity';

export enum BarcodeType {
  UPC = 'UPC',
  EAN = 'EAN',
  QR = 'QR',
  CODE128 = 'CODE128',
}

@Entity('products')
@Index(['barcode'])
@Index(['sku'])
@Index(['category'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    nullable: false,
  })
  barcode: string;

  @Column({
    type: 'enum',
    enum: BarcodeType,
    nullable: false,
  })
  barcodeType: BarcodeType;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  name: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description: string;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    nullable: true,
  })
  sku: string;

  @ManyToOne(() => Category, (category) => category.products, {
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  manufacturer: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 3,
    nullable: true,
  })
  weightKg: number;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  dimensions: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in';
  };

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  priceUsd: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  costUsd: number;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  imageUrl: string;

  @ManyToOne(() => Supplier, (supplier) => supplier.products, {
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({
    type: 'boolean',
    default: true,
  })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.productsCreated, {
    nullable: false,
  })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @OneToOne(() => Inventory, (inventory) => inventory.product, {
    nullable: true,
    eager: true,
  })
  inventory: Inventory;

  @CreateDateColumn({
    type: 'timestamp',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
  })
  updatedAt: Date;

  /**
   * Calculate margin percentage
   */
  getMarginPercentage(): number {
    if (!this.priceUsd || !this.costUsd) return 0;
    const margin = ((this.priceUsd - this.costUsd) / this.priceUsd) * 100;
    return Math.round(margin * 100) / 100;
  }

  /**
   * Check if product is low stock
   */
  isLowStock(): boolean {
    return (
      this.inventory?.quantityAvailable <
      (this.inventory?.reorderLevel || 10)
    );
  }
}
