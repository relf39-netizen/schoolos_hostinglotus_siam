// API Client for MySQL Backend (mimics Supabase client)

// Use absolute path to ensure it works regardless of current URL
const API_URL = window.location.origin + '/api';

// Helper to convert snake_case to camelCase
function toCamelCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => toCamelCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [key.replace(/([-_][a-z])/gi, ($1) => $1.toUpperCase().replace('-', '').replace('_', ''))]: toCamelCase(obj[key]),
      }),
      {},
    );
  }
  return obj;
}

// Helper to convert camelCase to snake_case
function toSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => toSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [key.replace(/[A-Z]/g, $1 => `_${$1.toLowerCase()}`)]: toSnakeCase(obj[key]),
      }),
      {},
    );
  }
  return obj;
}

class QueryBuilder {
  private table: string;
  private filters: Record<string, any> = {};

  constructor(table: string) {
    this.table = table;
  }

  select(fields: string = '*') {
    return this;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  order(column: string, { ascending = true } = {}) {
    // Ordering handled by server for now
    return this;
  }

  async then(resolve: any, reject: any) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for migration

      // Convert boolean filters to 1/0 for MySQL compatibility
      const processedFilters: Record<string, any> = {};
      Object.entries(this.filters).forEach(([key, value]) => {
        if (value === true) processedFilters[key] = '1';
        else if (value === false) processedFilters[key] = '0';
        else processedFilters[key] = value;
      });

      const queryParams = new URLSearchParams(toSnakeCase(processedFilters)).toString();
      const fullUrl = `${API_URL}/${this.table}?${queryParams}`;
      console.log(`[Supabase Mock] GET ${fullUrl}`, { filters: this.filters, processedFilters });
      
      const response = await fetch(fullUrl, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      
      if (response.ok) {
        try {
          const result = JSON.parse(text);
          let data = toCamelCase(result.data);
          console.log(`[Supabase Mock] Received ${data?.length || 0} rows from ${this.table}`);
          
          resolve({ data, error: null });
        } catch (e) {
          const errorMsg = `Server returned HTML instead of JSON for table "${this.table}". \n\nResponse snippet: ${text.substring(0, 200)}...`;
          resolve({ data: null, error: { message: errorMsg } });
        }
      }
 else {
        try {
          const result = JSON.parse(text);
          resolve({ data: null, error: { message: result.error || "Unknown server error" } });
        } catch (e) {
          const errorMsg = `Server error (${response.status}) for table "${this.table}". \n\nResponse snippet: ${text.substring(0, 200)}...`;
          resolve({ data: null, error: { message: errorMsg } });
        }
      }
    } catch (error: any) {
      console.error(`Supabase Mock Error (${this.table}):`, error);
      resolve({ data: null, error: { message: error.message } });
    }
  }

  // Support for .single()
  async single() {
    return new Promise(async (resolve) => {
      await this.then((res: any) => {
        if (res.data && Array.isArray(res.data)) {
          resolve({ data: res.data[0] || null, error: res.error });
        } else {
          resolve(res);
        }
      }, (err: any) => resolve({ data: null, error: err }));
    });
  }

  // Support for .maybeSingle()
  async maybeSingle() {
    return this.single();
  }
}

class MutationBuilder {
  private execute: () => Promise<any>;

  constructor(execute: () => Promise<any>) {
    this.execute = execute;
  }

  select(fields: string = '*') {
    return this;
  }

  single() {
    return this;
  }

  maybeSingle() {
    return this;
  }

  async then(resolve: any, reject: any) {
    try {
      const result = await this.execute();
      resolve(result);
    } catch (error) {
      if (reject) reject(error);
      else resolve({ data: null, error });
    }
  }
}

// Helper for Unicode-safe Base64 encoding
function b64EncodeUnicode(str: string) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
    return String.fromCharCode(parseInt(p1, 16));
  }));
}

class MutationQueryBuilder {
  private table: string;
  private action: 'update' | 'delete';
  private data?: any;
  private filters: Record<string, any> = {};

  constructor(table: string, action: 'update' | 'delete', data?: any) {
    this.table = table;
    this.action = action;
    this.data = data;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  async then(resolve: any, reject: any) {
    try {
      const snakeData = this.data ? toSnakeCase(this.data) : undefined;
      
      // Convert boolean filters to 1/0 for MySQL compatibility
      const processedFilters: Record<string, any> = {};
      Object.entries(this.filters).forEach(([key, value]) => {
        const snakeKey = key.replace(/[A-Z]/g, $1 => `_${$1.toLowerCase()}`);
        if (value === true) processedFilters[snakeKey] = '1';
        else if (value === false) processedFilters[snakeKey] = '0';
        else processedFilters[snakeKey] = value;
      });

      const payload: any = { 
        action: this.action, 
        table: this.table, 
        filters: processedFilters 
      };
      if (snakeData) payload.data = snakeData;

      const filterKeys = Object.keys(processedFilters);
      if (filterKeys.length === 1 && (filterKeys[0] === 'id' || filterKeys[0] === 'uuid')) {
        payload.id = processedFilters[filterKeys[0]];
        payload.pk = filterKeys[0];
        delete payload.filters;
      }

      const p = b64EncodeUnicode(JSON.stringify(payload));
      const response = await fetch(`${window.location.origin}/api/v1/bridge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p })
      });

      const text = await response.text();
      try {
        const result = JSON.parse(text);
        if (response.ok) {
          resolve({ data: result.data || true, error: null });
        } else {
          resolve({ data: null, error: { message: result.error || "Bridge mutation failed" } });
        }
      } catch (e) {
        // Fallback to form-urlencoded and /api/data-sync if JSON/bridge fails
        try {
          const fbResponse = await fetch(`${window.location.origin}/api/data-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `d=${encodeURIComponent(p)}`
          });
          const fbText = await fbResponse.text();
          const fbResult = JSON.parse(fbText);
          if (fbResponse.ok) {
            resolve({ data: fbResult.data || true, error: null });
          } else {
            throw new Error(fbResult.error);
          }
        } catch (fbE) {
          resolve({ data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${this.table} \nSnippet: ${text.substring(0, 100)}...` } });
        }
      }
    } catch (error: any) {
      console.error(`MutationQueryBuilder Error (${this.table}):`, error);
      resolve({ data: null, error: { message: error.message } });
    }
  }
}

export const supabase: any = {
  from: (table: string) => {
    return {
      select: (fields: string = '*') => new QueryBuilder(table),
      insert: (data: any) => {
        const execute = async () => {
          try {
            const snakeData = toSnakeCase(data);
            const payload = { action: 'insert', table, data: snakeData };
            const p = b64EncodeUnicode(JSON.stringify(payload));

            const b64Response = await fetch(`${window.location.origin}/api/v1/bridge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p })
            });

            const b64Text = await b64Response.text();
            try {
              const b64Result = JSON.parse(b64Text);
              return b64Response.ok ? { data: toCamelCase(b64Result.data), error: null } : { data: null, error: { message: b64Result.error } };
            } catch (b64E) {
              // Fallback
              const fbResponse = await fetch(`${window.location.origin}/api/data-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `d=${encodeURIComponent(p)}`
              });
              const fbText = await fbResponse.text();
              try {
                const fbResult = JSON.parse(fbText);
                return fbResponse.ok ? { data: toCamelCase(fbResult.data), error: null } : { data: null, error: { message: fbResult.error } };
              } catch (e2) {
                return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${b64Text.substring(0, 100)}...` } };
              }
            }
          } catch (error: any) {
            return { data: null, error: { message: error.message } };
          }
        };

        return new MutationBuilder(execute);
      },
      update: (data: any) => new MutationQueryBuilder(table, 'update', data),
      delete: () => new MutationQueryBuilder(table, 'delete'),
  upsert: (data: any) => {
        const execute = async () => {
          try {
            const snakeData = toSnakeCase(data);
            const payload = { action: 'upsert', table, data: snakeData };
            const p = b64EncodeUnicode(JSON.stringify(payload));

            const b64Response = await fetch(`${window.location.origin}/api/v1/bridge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ p })
            });

            const b64Text = await b64Response.text();
            try {
              const b64Result = JSON.parse(b64Text);
              return b64Response.ok ? { data: toCamelCase(b64Result.data), error: null } : { data: null, error: { message: b64Result.error } };
            } catch (b64E) {
              // Fallback
              const fbResponse = await fetch(`${window.location.origin}/api/data-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `d=${encodeURIComponent(p)}`
              });
              const fbText = await fbResponse.text();
              try {
                const fbResult = JSON.parse(fbText);
                return fbResponse.ok ? { data: toCamelCase(fbResult.data), error: null } : { data: null, error: { message: fbResult.error } };
              } catch (e2) {
                return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${b64Text.substring(0, 100)}...` } };
              }
            }
          } catch (error: any) {
            return { data: null, error: { message: error.message } };
          }
        };

        return new MutationBuilder(execute);
      }
    };
  },
  channel: () => ({
    on: () => ({
      subscribe: () => ({})
    })
  }),
  removeChannel: () => {}
};

export const isConfigured = true;
