import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';

/**
 * ID Mapper - Manages consistent ID generation and mapping across services
 */
export class IdMapper {
  private static instance: IdMapper;
  private mongoIdMap: Map<string, ObjectId> = new Map();
  private uuidMap: Map<string, string> = new Map();
  private relationships: Map<string, Set<string>> = new Map();

  private constructor() {}

  static getInstance(): IdMapper {
    if (!IdMapper.instance) {
      IdMapper.instance = new IdMapper();
    }
    return IdMapper.instance;
  }

  /**
   * Generate or get existing MongoDB ObjectId
   */
  getMongoId(key: string): ObjectId {
    if (!this.mongoIdMap.has(key)) {
      this.mongoIdMap.set(key, new ObjectId());
    }
    return this.mongoIdMap.get(key)!;
  }

  /**
   * Generate or get existing UUID
   */
  getUuid(key: string): string {
    if (!this.uuidMap.has(key)) {
      this.uuidMap.set(key, uuidv4());
    }
    return this.uuidMap.get(key)!;
  }

  /**
   * Set a specific MongoDB ObjectId for a key
   */
  setMongoId(key: string, id: ObjectId): void {
    this.mongoIdMap.set(key, id);
  }

  /**
   * Set a specific UUID for a key
   */
  setUuid(key: string, id: string): void {
    this.uuidMap.set(key, id);
  }

  /**
   * Add relationship between entities
   */
  addRelationship(parentKey: string, childKey: string): void {
    if (!this.relationships.has(parentKey)) {
      this.relationships.set(parentKey, new Set());
    }
    this.relationships.get(parentKey)!.add(childKey);
  }

  /**
   * Get all children of a parent entity
   */
  getChildren(parentKey: string): string[] {
    return Array.from(this.relationships.get(parentKey) || []);
  }

  /**
   * Generate user IDs (MongoDB ObjectIds)
   */
  generateUserIds(count: number): ObjectId[] {
    const ids: ObjectId[] = [];
    for (let i = 1; i <= count; i++) {
      const id = this.getMongoId(`user_${i}`);
      ids.push(id);
    }
    return ids;
  }

  /**
   * Generate product IDs (MongoDB ObjectIds)
   */
  generateProductIds(count: number): ObjectId[] {
    const ids: ObjectId[] = [];
    for (let i = 1; i <= count; i++) {
      const id = this.getMongoId(`product_${i}`);
      ids.push(id);
    }
    return ids;
  }

  /**
   * Generate order IDs (UUIDs for PostgreSQL services)
   */
  generateOrderIds(count: number): string[] {
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      const id = this.getUuid(`order_${i}`);
      ids.push(id);
    }
    return ids;
  }

  /**
   * Get mapping statistics
   */
  getStats(): { mongoIds: number; uuids: number; relationships: number } {
    return {
      mongoIds: this.mongoIdMap.size,
      uuids: this.uuidMap.size,
      relationships: this.relationships.size,
    };
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    this.mongoIdMap.clear();
    this.uuidMap.clear();
    this.relationships.clear();
  }

  /**
   * Export all mappings for backup/restore
   */
  export(): {
    mongoIds: [string, string][];
    uuids: [string, string][];
    relationships: [string, string[]][];
  } {
    return {
      mongoIds: Array.from(this.mongoIdMap.entries()).map(([k, v]) => [k, v.toString()]),
      uuids: Array.from(this.uuidMap.entries()),
      relationships: Array.from(this.relationships.entries()).map(([k, v]) => [k, Array.from(v)]),
    };
  }
}

export const idMapper = IdMapper.getInstance();
