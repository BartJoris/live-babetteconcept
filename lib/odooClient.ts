const ODOO_URL = process.env.ODOO_URL || 'https://www.babetteconcept.be/jsonrpc';
const ODOO_DB = process.env.ODOO_DB || 'babetteconcept';

export interface OdooCallParams {
  uid: number;
  password: string;
  model: string;
  method: string;
  args: unknown[];
  kwargs?: Record<string, unknown>;
}

export interface OdooResponse<T = unknown> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: {
      message?: string;
      debug?: string;
    };
  };
}

/**
 * Centralized Odoo API client with error handling and type safety
 */
export class OdooClient {
  private url: string;
  private db: string;

  constructor(url?: string, db?: string) {
    this.url = url || ODOO_URL;
    this.db = db || ODOO_DB;
  }

  /**
   * Authenticate a user with Odoo
   */
  async authenticate(username: string, password: string): Promise<number | null> {
    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'common',
        method: 'authenticate',
        args: [this.db, username, password, {}],
      },
      id: Date.now(),
    };

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json: OdooResponse<number> = await response.json();
      
      if (json.error) {
        console.error('Odoo authentication error:', json.error);
        return null;
      }

      return json.result ?? null;
    } catch (error) {
      console.error('Odoo authentication failed:', error);
      return null;
    }
  }

  /**
   * Execute a generic Odoo RPC call
   */
  async call<T = unknown>(params: OdooCallParams): Promise<T> {
    const { uid, password, model, method, args, kwargs } = params;

    const executeArgs: unknown[] = [this.db, uid, password, model, method, args];
    if (kwargs) {
      executeArgs.push(kwargs);
    }

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: executeArgs,
      },
      id: Date.now(),
    };

    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json: OdooResponse<T> = await response.json();

    if (json.error) {
      const errorMessage = json.error.data?.message || json.error.message || 'Unknown Odoo error';
      throw new Error(errorMessage);
    }

    if (json.result === undefined) {
      throw new Error('No result returned from Odoo');
    }

    return json.result;
  }

  /**
   * Search and read records from Odoo
   */
  async searchRead<T = unknown>(
    uid: number,
    password: string,
    model: string,
    domain: unknown[] = [],
    fields: string[] = [],
    limit?: number,
    offset?: number,
    order?: string
  ): Promise<T[]> {
    const args: unknown[] = [domain];
    
    if (fields.length > 0) {
      args.push(fields);
    }
    
    const kwargs: Record<string, unknown> = {};
    if (limit !== undefined) kwargs.limit = limit;
    if (offset !== undefined) kwargs.offset = offset;
    if (order) kwargs.order = order;

    return this.call<T[]>({
      uid,
      password,
      model,
      method: 'search_read',
      args,
      kwargs: Object.keys(kwargs).length > 0 ? kwargs : undefined,
    });
  }

  /**
   * Search for record IDs in Odoo
   */
  async search(
    uid: number,
    password: string,
    model: string,
    domain: unknown[] = [],
    limit?: number,
    offset?: number,
    order?: string
  ): Promise<number[]> {
    const args: unknown[] = [domain];
    const kwargs: Record<string, unknown> = {};
    
    if (limit !== undefined) kwargs.limit = limit;
    if (offset !== undefined) kwargs.offset = offset;
    if (order) kwargs.order = order;

    return this.call<number[]>({
      uid,
      password,
      model,
      method: 'search',
      args,
      kwargs: Object.keys(kwargs).length > 0 ? kwargs : undefined,
    });
  }

  /**
   * Read records from Odoo by IDs
   */
  async read<T = unknown>(
    uid: number,
    password: string,
    model: string,
    ids: number[],
    fields: string[] = []
  ): Promise<T[]> {
    const args: unknown[] = [ids];
    if (fields.length > 0) {
      args.push(fields);
    }

    return this.call<T[]>({
      uid,
      password,
      model,
      method: 'read',
      args,
    });
  }

  /**
   * Create a new record in Odoo
   */
  async create(
    uid: number,
    password: string,
    model: string,
    values: Record<string, unknown>
  ): Promise<number> {
    return this.call<number>({
      uid,
      password,
      model,
      method: 'create',
      args: [values],
    });
  }

  /**
   * Update records in Odoo
   */
  async write(
    uid: number,
    password: string,
    model: string,
    ids: number[],
    values: Record<string, unknown>
  ): Promise<boolean> {
    return this.call<boolean>({
      uid,
      password,
      model,
      method: 'write',
      args: [ids, values],
    });
  }

  /**
   * Delete records from Odoo
   */
  async unlink(
    uid: number,
    password: string,
    model: string,
    ids: number[]
  ): Promise<boolean> {
    return this.call<boolean>({
      uid,
      password,
      model,
      method: 'unlink',
      args: [ids],
    });
  }
}

// Export a singleton instance
export const odooClient = new OdooClient();

