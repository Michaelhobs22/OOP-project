import { Repository, FindOptionsWhere, DeepPartial } from 'typeorm';

export abstract class BaseRepository<T> {
  protected repo: Repository<T>;

  constructor(repository: Repository<T>) {
    this.repo = repository;
  }

  /**
   * Find entity by ID
   * @param id - Entity ID
   * @returns Promise<T | null>
   */
  async findById(id: string | number): Promise<T | null> {
    try {
      return await this.repo.findOne({
        where: { id } as FindOptionsWhere<T>,
      });
    } catch (error) {
      throw new Error(`Error finding entity by ID: ${error}`);
    }
  }

  /**
   * Find all entities with optional filtering
   * @param where - Filter conditions
   * @returns Promise<T[]>
   */
  async findAll(where?: FindOptionsWhere<T>): Promise<T[]> {
    try {
      return await this.repo.find(where ? { where } : {});
    } catch (error) {
      throw new Error(`Error finding all entities: ${error}`);
    }
  }

  /**
   * Find one entity by criteria
   * @param where - Search criteria
   * @returns Promise<T | null>
   */
  async findOne(where: FindOptionsWhere<T>): Promise<T | null> {
    try {
      return await this.repo.findOne({ where });
    } catch (error) {
      throw new Error(`Error finding one entity: ${error}`);
    }
  }

  /**
   * Create and save entity
   * @param data - Entity data
   * @returns Promise<T>
   */
  async create(data: DeepPartial<T>): Promise<T> {
    try {
      const entity = this.repo.create(data);
      return await this.repo.save(entity);
    } catch (error) {
      throw new Error(`Error creating entity: ${error}`);
    }
  }

  /**
   * Update entity
   * @param id - Entity ID
   * @param data - Update data
   * @returns Promise<T | null>
   */
  async update(id: string | number, data: DeepPartial<T>): Promise<T | null> {
    try {
      await this.repo.update(id, data);
      return this.findById(id);
    } catch (error) {
      throw new Error(`Error updating entity: ${error}`);
    }
  }

  /**
   * Delete entity (soft delete by default)
   * @param id - Entity ID
   * @returns Promise<boolean>
   */
  async delete(id: string | number): Promise<boolean> {
    try {
      const result = await this.repo.delete(id);
      return result.affected !== undefined && result.affected > 0;
    } catch (error) {
      throw new Error(`Error deleting entity: ${error}`);
    }
  }

  /**
   * Paginated find
   * @param page - Page number
   * @param limit - Items per page
   * @param where - Filter criteria
   * @returns Promise<{ data: T[], total: number, page: number, pages: number }>
   */
  async findPaginated(
    page: number = 1,
    limit: number = 10,
    where?: FindOptionsWhere<T>
  ): Promise<{ data: T[]; total: number; page: number; pages: number }> {
    try {
      const skip = (page - 1) * limit;
      const [data, total] = await this.repo.findAndCount(
        where ? { where, skip, take: limit } : { skip, take: limit }
      );

      return {
        data,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    } catch (error) {
      throw new Error(`Error finding paginated entities: ${error}`);
    }
  }

  /**
   * Check if entity exists
   * @param where - Search criteria
   * @returns Promise<boolean>
   */
  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    try {
      const result = await this.repo.findOne({ where });
      return result !== null;
    } catch (error) {
      throw new Error(`Error checking entity existence: ${error}`);
    }
  }
}
