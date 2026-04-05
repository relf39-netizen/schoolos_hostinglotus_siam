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
  private inFilters: Record<string, any[]> = {};
  private orderBy?: { column: string; ascending: boolean };

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

  in(column: string, values: any[]) {
    this.inFilters[column] = values;
    return this;
  }

  order(column: string, { ascending = true } = {}) {
    this.orderBy = { column, ascending };
    return this;
  }

  async then(resolve: any, reject: any) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout for migration

      // Convert boolean filters to 1/0 for MySQL compatibility
      const processedFilters: Record<string, any> = {};
      Object.entries(this.filters).forEach(([key, value]) => {
        const snakeKey = key.replace(/[A-Z]/g, $1 => `_${$1.toLowerCase()}`);
        if (value === true) processedFilters[snakeKey] = '1';
        else if (value === false) processedFilters[snakeKey] = '0';
        else processedFilters[snakeKey] = value;
      });

      const processedInFilters: Record<string, any[]> = {};
      Object.entries(this.inFilters).forEach(([key, values]) => {
        const snakeKey = key.replace(/[A-Z]/g, $1 => `_${$1.toLowerCase()}`);
        processedInFilters[snakeKey] = values;
      });

      // Use POST bridge for SELECT to bypass WAF
      const payload: any = {
        action: 'select',
        table: this.table,
        filters: processedFilters,
        inFilters: processedInFilters
      };

      if (this.orderBy) {
        payload.order = {
          column: this.orderBy.column.replace(/[A-Z]/g, $1 => `_${$1.toLowerCase()}`),
          ascending: this.orderBy.ascending
        };
      }

      const p = b64EncodeUnicode(JSON.stringify(payload));

      // Try multiple endpoints, parameter names, and HTTP methods to bypass aggressive WAFs
      const endpoints = [
        { url: '/v1/bridge', param: 'p', method: 'POST' },
        { url: '/v1/sync', param: 'z', method: 'POST' },
        { url: '/v1/bridge', param: 'p', method: 'GET' }, // Try GET fallback
        { url: '/data-sync', param: 'd', method: 'POST' },
        { url: '/bridge', param: 'payload', method: 'POST' }
      ];

      let lastErrorSnippet = '';
      let success = false;
      let finalResult: any = null;

      for (const endpoint of endpoints) {
        try {
          const fetchUrl = endpoint.method === 'GET' 
            ? `${API_URL}${endpoint.url}?${endpoint.param}=${encodeURIComponent(p)}`
            : `${API_URL}${endpoint.url}`;
          
          const fetchOptions: any = {
            method: endpoint.method,
            headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
            signal: controller.signal
          };
          
          if (endpoint.method === 'POST') {
            fetchOptions.body = `${endpoint.param}=${encodeURIComponent(p)}`;
          }

          const response = await fetch(fetchUrl, fetchOptions);
          const text = await response.text();
          
          if (response.ok) {
            try {
              const result = JSON.parse(text);
              let data = toCamelCase(result.data);
              console.log(`[Supabase Mock] Received ${data?.length || 0} rows from ${this.table} via ${endpoint.url} (${endpoint.method})`);
              finalResult = { data, error: null };
              success = true;
              break;
            } catch (e) {
              lastErrorSnippet = text.substring(0, 100);
              continue;
            }
          } else {
            try {
              const result = JSON.parse(text);
              finalResult = { data: null, error: { message: result.error || "Unknown server error" } };
              success = true; // Server returned a JSON error, so it's not a WAF block
              break;
            } catch (e) {
              lastErrorSnippet = text.substring(0, 100);
              continue;
            }
          }
        } catch (e) {
          continue;
        }
      }

      clearTimeout(timeoutId);

      if (success) {
        resolve(finalResult);
      } else {
        const errorMsg = `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${this.table} \nSnippet: ${lastErrorSnippet}...`;
        resolve({ data: null, error: { message: errorMsg } });
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
  private inFilters: Record<string, any[]> = {};

  constructor(table: string, action: 'update' | 'delete', data?: any) {
    this.table = table;
    this.action = action;
    this.data = data;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  in(column: string, values: any[]) {
    this.inFilters[column] = values;
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

      const processedInFilters: Record<string, any[]> = {};
      Object.entries(this.inFilters).forEach(([key, values]) => {
        const snakeKey = key.replace(/[A-Z]/g, $1 => `_${$1.toLowerCase()}`);
        processedInFilters[snakeKey] = values;
      });

      const payload: any = { 
        action: this.action, 
        table: this.table, 
        filters: processedFilters,
        inFilters: processedInFilters
      };
      if (snakeData) payload.data = snakeData;

      const filterKeys = Object.keys(processedFilters);
      if (filterKeys.length === 1 && (filterKeys[0] === 'id' || filterKeys[0] === 'uuid')) {
        payload.id = processedFilters[filterKeys[0]];
        payload.pk = filterKeys[0];
        delete payload.filters;
      }

      const p = b64EncodeUnicode(JSON.stringify(payload));
      
      // Try multiple endpoints, parameter names, and HTTP methods to bypass aggressive WAFs
      const endpoints = [
        { url: '/api/v1/sync', param: 'z', method: 'POST' },
        { url: '/api/v1/bridge', param: 'p', method: 'POST' },
        { url: '/api/v1/sync', param: 'z', method: 'GET' }, // Try GET fallback
        { url: '/api/data-sync', param: 'd', method: 'POST' },
        { url: '/api/bridge', param: 'payload', method: 'POST' }
      ];

      let lastErrorSnippet = '';
      
      for (const endpoint of endpoints) {
        try {
          const fetchUrl = endpoint.method === 'GET' 
            ? `${window.location.origin}${endpoint.url}?${endpoint.param}=${encodeURIComponent(p)}`
            : `${window.location.origin}${endpoint.url}`;
          
          const fetchOptions: any = {
            method: endpoint.method,
            headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
          };
          
          if (endpoint.method === 'POST') {
            fetchOptions.body = `${endpoint.param}=${encodeURIComponent(p)}`;
          }

          const response = await fetch(fetchUrl, fetchOptions);

          const text = await response.text();
          try {
            const result = JSON.parse(text);
            if (response.ok) {
              return resolve({ data: result.data || true, error: null });
            } else {
              // If server returned a JSON error, it's a real error, not a WAF block
              return resolve({ data: null, error: { message: result.error || "Mutation failed" } });
            }
          } catch (e) {
            // Not JSON - likely a WAF block or server error page
            lastErrorSnippet = text.substring(0, 100);
            continue; // Try next endpoint
          }
        } catch (e) {
          continue; // Network error or something else, try next
        }
      }

      // If all failed
      resolve({ data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${this.table} \nSnippet: ${lastErrorSnippet}...` } });
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

            const endpoints = [
              { url: '/api/v1/sync', param: 'z', method: 'POST' },
              { url: '/api/v1/bridge', param: 'p', method: 'POST' },
              { url: '/api/v1/sync', param: 'z', method: 'GET' },
              { url: '/api/data-sync', param: 'd', method: 'POST' },
              { url: '/api/bridge', param: 'payload', method: 'POST' }
            ];

            let lastErrorSnippet = '';

            for (const endpoint of endpoints) {
              try {
                const fetchUrl = endpoint.method === 'GET' 
                  ? `${window.location.origin}${endpoint.url}?${endpoint.param}=${encodeURIComponent(p)}`
                  : `${window.location.origin}${endpoint.url}`;
                
                const fetchOptions: any = {
                  method: endpoint.method,
                  headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
                };
                
                if (endpoint.method === 'POST') {
                  fetchOptions.body = `${endpoint.param}=${encodeURIComponent(p)}`;
                }

                const response = await fetch(fetchUrl, fetchOptions);

                const text = await response.text();
                try {
                  const result = JSON.parse(text);
                  if (response.ok) {
                    return { data: toCamelCase(result.data), error: null };
                  } else {
                    return { data: null, error: { message: result.error || "Insert failed" } };
                  }
                } catch (e) {
                  lastErrorSnippet = text.substring(0, 100);
                  continue;
                }
              } catch (e) {
                continue;
              }
            }

            return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${lastErrorSnippet}...` } };
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

            const endpoints = [
              { url: '/api/v1/sync', param: 'z', method: 'POST' },
              { url: '/api/v1/bridge', param: 'p', method: 'POST' },
              { url: '/api/v1/sync', param: 'z', method: 'GET' },
              { url: '/api/data-sync', param: 'd', method: 'POST' },
              { url: '/api/bridge', param: 'payload', method: 'POST' }
            ];

            let lastErrorSnippet = '';

            for (const endpoint of endpoints) {
              try {
                const fetchUrl = endpoint.method === 'GET' 
                  ? `${window.location.origin}${endpoint.url}?${endpoint.param}=${encodeURIComponent(p)}`
                  : `${window.location.origin}${endpoint.url}`;
                
                const fetchOptions: any = {
                  method: endpoint.method,
                  headers: endpoint.method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}
                };
                
                if (endpoint.method === 'POST') {
                  fetchOptions.body = `${endpoint.param}=${encodeURIComponent(p)}`;
                }

                const response = await fetch(fetchUrl, fetchOptions);

                const text = await response.text();
                try {
                  const result = JSON.parse(text);
                  if (response.ok) {
                    return { data: toCamelCase(result.data), error: null };
                  } else {
                    return { data: null, error: { message: result.error || "Upsert failed" } };
                  }
                } catch (e) {
                  lastErrorSnippet = text.substring(0, 100);
                  continue;
                }
              } catch (e) {
                continue;
              }
            }

            return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${lastErrorSnippet}...` } };
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
