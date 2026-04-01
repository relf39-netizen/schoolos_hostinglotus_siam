// API Client for MySQL Backend (mimics Supabase client)

// Use absolute path to ensure it works regardless of current URL
const API_URL = window.location.origin + '/api';

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

      const queryParams = new URLSearchParams(this.filters).toString();
      const response = await fetch(`${API_URL}/${this.table}?${queryParams}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      
      if (response.ok) {
        try {
          const result = JSON.parse(text);
          resolve({ data: result.data, error: null });
        } catch (e) {
          const errorMsg = `Server returned HTML instead of JSON for table "${this.table}". \n\nResponse snippet: ${text.substring(0, 100)}...`;
          resolve({ data: null, error: { message: errorMsg } });
        }
      } else {
        try {
          const result = JSON.parse(text);
          resolve({ data: null, error: { message: result.error || "Unknown server error" } });
        } catch (e) {
          const errorMsg = `Server error (${response.status}) for table "${this.table}". \n\nResponse snippet: ${text.substring(0, 100)}...`;
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
            const response = await fetch(`${API_URL}/${table}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            
            const text = await response.text();
            let result;
            try {
              result = JSON.parse(text);
              if (!response.ok) {
                // If JSON failed, try Base64 fallback (might be WAF blocking large JSON)
                throw new Error(result.error || "JSON Insert failed");
              }
              return { data: result.data, error: null };
            } catch (e) {
              console.warn(`Insert JSON failed for ${table}, retrying with Base64...`);
              const jsonString = JSON.stringify(data);
              const encodedData = b64EncodeUnicode(jsonString);

              const b64Response = await fetch(`${API_URL}/v1/transfer/${table}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ encodedData })
              });

              const b64Text = await b64Response.text();
              try {
                const b64Result = JSON.parse(b64Text);
                return b64Response.ok ? { data: b64Result.data, error: null } : { data: null, error: { message: b64Result.error } };
              } catch (b64E) {
                return { data: null, error: { message: "Server returned non-JSON response during Base64 fallback." } };
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
                const response = await fetch(`${API_URL}/${table}/${value}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                });
                
                const text = await response.text();
                try {
                  const result = JSON.parse(text);
                  if (!response.ok) {
                    throw new Error(result.error || "JSON Update failed");
                  }
                  return { data: result.data, error: null };
                } catch (e) {
                  // Fallback to transfer endpoint for updates if PATCH fails (WAF/Size)
                  console.warn(`Update JSON failed for ${table}, retrying with Base64 Transfer...`);
                  const payload = { ...data, [column]: value }; // Ensure ID is included for upsert-like behavior
                  const jsonString = JSON.stringify([payload]);
                  const encodedData = b64EncodeUnicode(jsonString);

                  const b64Response = await fetch(`${API_URL}/v1/transfer/${table}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ encodedData })
                  });

                  const b64Text = await b64Response.text();
                  try {
                    const b64Result = JSON.parse(b64Text);
                    return b64Response.ok ? { data: b64Result.data, error: null } : { data: null, error: { message: b64Result.error } };
                  } catch (b64E) {
                    return { data: null, error: { message: "Server returned non-JSON response during Base64 update fallback." } };
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
                  const response = await fetch(`${API_URL}/${table}/${value}`, {
                    method: 'DELETE'
                  });
                  
                  const contentType = response.headers.get("content-type");
                  if (!contentType || !contentType.includes("application/json")) {
                    resolve({ data: null, error: { message: "Server returned non-JSON response." } });
                    return;
                  }

                  const result = await response.json();
                  resolve(response.ok ? { data: true, error: null } : { data: null, error: { message: result.error } });
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
            const items = Array.isArray(data) ? data : [data];
            // ส่งทีละ 1 รายการเพื่อความปลอดภัยสูงสุดและไม่ให้ Request ใหญ่เกินไป
            const chunkSize = 1; 
            
            const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

            for (let i = 0; i < items.length; i += chunkSize) {
              const chunk = items.slice(i, i + chunkSize);
              
              // เพิ่มการรอ 1 วินาที (1000ms) เพื่อไม่ให้ Request ถี่เกินไป
              if (i > 0) await delay(1000);

              // ลองส่งแบบ JSON ปกติก่อน (ประหยัด Bandwidth และลดโอกาสติด Firewall ของบางที่)
              // หากติด Firewall จริงๆ ค่อยใช้ Base64 (แต่ Base64 จะทำให้ Request ใหญ่ขึ้น 33%)
              try {
                const response = await fetch(`${API_URL}/v1/transfer/${table}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(chunk)
                });

                const text = await response.text();
                let result;
                try {
                  result = JSON.parse(text);
                  if (!response.ok) {
                    return { data: null, error: { message: result.error || "เกิดข้อผิดพลาดระหว่างนำเข้าข้อมูล" } };
                  }
                } catch (e) {
                  // ถ้าส่ง JSON ปกติแล้วได้ HTML (อาจติด WAF) ให้ลองส่งแบบ Base64
                  console.warn(`JSON request failed for ${table}, retrying with Base64...`);
                  
                  const jsonString = JSON.stringify(chunk);
                  const encodedData = b64EncodeUnicode(jsonString);

                  const b64Response = await fetch(`${API_URL}/v1/transfer/${table}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ encodedData })
                  });

                  const b64Text = await b64Response.text();
                  try {
                    const b64Result = JSON.parse(b64Text);
                    if (!b64Response.ok) {
                      return { data: null, error: { message: b64Result.error || "เกิดข้อผิดพลาดระหว่างนำเข้าข้อมูล (Base64)" } };
                    }
                  } catch (b64E) {
                    console.error(`Invalid API response (not JSON) for ${table}/transfer (Base64):`, b64Text.substring(0, 500));
                    return { data: null, error: { message: `เซิร์ฟเวอร์ Hosting ปฏิเสธการเชื่อมต่อ (อาจเพราะข้อมูลมีขนาดใหญ่เกินไป หรือติด Firewall ขั้นรุนแรง) \nตาราง: ${table} \nSnippet: ${b64Text.substring(0, 100)}...` } };
                  }
                }
              } catch (fetchError: any) {
                return { data: null, error: { message: `ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้: ${fetchError.message}` } };
              }
            }
            
            return { data: true, error: null };
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
