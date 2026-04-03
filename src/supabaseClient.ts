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

export const supabase: any = {
  from: (table: string) => {
    return {
      select: (fields: string = '*') => new QueryBuilder(table),
      insert: (data: any) => {
        const execute = async () => {
          try {
            const snakeData = toSnakeCase(data);
            const response = await fetch(`${API_URL}/${table}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(snakeData)
            });
            
            const text = await response.text();
            let result;
            try {
              result = JSON.parse(text);
              if (!response.ok) {
                throw new Error(result.error || "JSON Insert failed");
              }
              return { data: toCamelCase(result.data), error: null };
            } catch (e) {
              console.warn(`Insert JSON failed for ${table}, retrying with POST insert fallback...`);
              const postResponse = await fetch(`${API_URL}/${table}/insert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snakeData)
              });
              const postText = await postResponse.text();
              try {
                const postResult = JSON.parse(postText);
                if (postResponse.ok) {
                  return { data: toCamelCase(postResult.data), error: null };
                } else {
                  throw new Error(postResult.error || "POST Insert fallback failed");
                }
              } catch (postE) {
                console.warn(`POST insert fallback failed for ${table}, retrying with Bridge...`);
                const payload = { action: 'insert', table, data: snakeData };
                const p = b64EncodeUnicode(JSON.stringify(payload));

                const b64Response = await fetch(`${API_URL}/data-sync`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: `d=${encodeURIComponent(p)}`
                });

                const b64Text = await b64Response.text();
                try {
                  const b64Result = JSON.parse(b64Text);
                  return b64Response.ok ? { data: b64Result.data, error: null } : { data: null, error: { message: b64Result.error } };
                } catch (b64E) {
                  return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${b64Text.substring(0, 100)}...` } };
                }
              }
            }
          } catch (error: any) {
            return { data: null, error: { message: error.message } };
          }
        };

        return new MutationBuilder(execute);
      },
      update: (data: any) => {
        return {
          eq: (column: string, value: any) => {
            const execute = async () => {
              try {
                const snakeData = toSnakeCase(data);
                const response = await fetch(`${API_URL}/${table}/${value}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(snakeData)
                });
                
                const text = await response.text();
                try {
                  const result = JSON.parse(text);
                  if (!response.ok) {
                    throw new Error(result.error || "JSON Update failed");
                  }
                  return { data: toCamelCase(result.data), error: null };
                } catch (e) {
                  console.warn(`Update JSON failed for ${table}, retrying with POST update fallback...`);
                  const postResponse = await fetch(`${API_URL}/${table}/${value}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(snakeData)
                  });
                  const postText = await postResponse.text();
                  try {
                    const postResult = JSON.parse(postText);
                    if (postResponse.ok) {
                      return { data: toCamelCase(postResult.data), error: null };
                    } else {
                      throw new Error(postResult.error || "POST Update fallback failed");
                    }
                  } catch (postE) {
                    console.warn(`POST update fallback failed for ${table}, retrying with Bridge...`);
                    const payload = { action: 'update', table, data: snakeData, id: value, pk: toSnakeCase(column) };
                    const p = b64EncodeUnicode(JSON.stringify(payload));

                    const b64Response = await fetch(`${API_URL}/data-sync`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: `d=${encodeURIComponent(p)}`
                    });

                    const b64Text = await b64Response.text();
                    try {
                      const b64Result = JSON.parse(b64Text);
                      return b64Response.ok ? { data: b64Result.data, error: null } : { data: null, error: { message: b64Result.error } };
                    } catch (b64E) {
                      return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${b64Text.substring(0, 100)}...` } };
                    }
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
      delete: () => {
        return {
          eq: (column: string, value: any) => {
            return {
              async then(resolve: any) {
                try {
                  console.log(`[Supabase Mock] DELETE ${table}/${value}`, { column });
                  const response = await fetch(`${API_URL}/${table}/${value}`, {
                    method: 'DELETE'
                  });
                  
                  const text = await response.text();
                  try {
                    const result = JSON.parse(text);
                    if (!response.ok) {
                      throw new Error(result.error || "JSON Delete failed");
                    }
                    resolve({ data: true, error: null });
                  } catch (e) {
                    console.warn(`Delete JSON failed for ${table}, retrying with POST delete fallback...`);
                    const postResponse = await fetch(`${API_URL}/${table}/${value}/delete`, {
                      method: 'POST'
                    });
                    const postText = await postResponse.text();
                    try {
                      const postResult = JSON.parse(postText);
                      if (postResponse.ok) {
                        resolve({ data: true, error: null });
                      } else {
                        throw new Error(postResult.error || "POST Delete fallback failed");
                      }
                    } catch (postE) {
                      console.warn(`POST delete fallback failed for ${table}, retrying with Bridge...`);
                      const payload = { action: 'delete', table, id: value, pk: toSnakeCase(column) };
                      const p = b64EncodeUnicode(JSON.stringify(payload));

                      const b64Response = await fetch(`${API_URL}/data-sync`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `d=${encodeURIComponent(p)}`
                      });

                      const b64Text = await b64Response.text();
                      try {
                        const b64Result = JSON.parse(b64Text);
                        resolve(b64Response.ok ? { data: true, error: null } : { data: null, error: { message: b64Result.error } });
                      } catch (b64E) {
                        resolve({ data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${b64Text.substring(0, 100)}...` } });
                      }
                    }
                  }
                } catch (error: any) {
                  resolve({ data: null, error: { message: error.message } });
                }
              }
            };
          }
        };
      },
      upsert: (data: any) => {
        const execute = async () => {
          try {
            const snakeData = toSnakeCase(data);
            const items = Array.isArray(snakeData) ? snakeData : [snakeData];
            console.log(`[Supabase Mock] UPSERT ${table}`, { itemsCount: items.length });
            const chunkSize = 3; 
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            const allResults = [];
            for (let i = 0; i < items.length; i += chunkSize) {
              const chunk = items.slice(i, i + chunkSize);
              if (i > 0) await delay(500);

              let success = false;
              let attempts = 0;
              const maxAttempts = 2;

              while (!success && attempts < maxAttempts) {
                attempts++;
                try {
                  const response = await fetch(`${API_URL}/${table}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(chunk)
                  });

                  const text = await response.text();
                  try {
                    const result = JSON.parse(text);
                    if (response.ok) {
                      const resultData = toCamelCase(result.data);
                      allResults.push(...(Array.isArray(resultData) ? resultData : [resultData]));
                      success = true;
                    } else {
                      throw new Error(result.error || "Server rejected JSON");
                    }
                  } catch (e) {
                    console.warn(`Upsert JSON failed for ${table}, retrying with POST upsert fallback...`);
                    const postResponse = await fetch(`${API_URL}/${table}/upsert`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(chunk)
                    });
                    const postText = await postResponse.text();
                    try {
                      const postResult = JSON.parse(postText);
                      if (postResponse.ok) {
                        const postResultData = toCamelCase(postResult.data);
                        allResults.push(...(Array.isArray(postResultData) ? postResultData : [postResultData]));
                        success = true;
                      } else {
                        throw new Error(postResult.error || "POST Upsert fallback failed");
                      }
                    } catch (postE) {
                      console.warn(`POST upsert fallback failed for ${table}, retrying with Bridge...`);
                      const payload = { action: 'upsert', table, data: chunk };
                      const p = b64EncodeUnicode(JSON.stringify(payload));

                      const b64Response = await fetch(`${API_URL}/data-sync`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `d=${encodeURIComponent(p)}`
                      });

                      const b64Text = await b64Response.text();
                      try {
                        const b64Result = JSON.parse(b64Text);
                        if (b64Response.ok) {
                          const b64ResultData = toCamelCase(b64Result.data);
                          allResults.push(...(Array.isArray(b64ResultData) ? b64ResultData : [b64ResultData]));
                          success = true;
                        } else {
                          if (attempts >= maxAttempts) return { data: null, error: { message: b64Result.error || "Firewall blocked Bridge request" } };
                          await delay(1000 * attempts);
                        }
                      } catch (b64E) {
                        if (attempts >= maxAttempts) {
                          return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (Firewall บล็อกการเข้าถึง) \nตาราง: ${table} \nSnippet: ${b64Text.substring(0, 100)}...` } };
                        }
                        await delay(1000 * attempts);
                      }
                    }
                  }
                } catch (fetchError: any) {
                  if (attempts >= maxAttempts) return { data: null, error: { message: `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ${fetchError.message}` } };
                  await delay(1000 * attempts);
                }
              }
            }
            return { data: allResults, error: null };
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
