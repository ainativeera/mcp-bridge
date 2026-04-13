export interface MCPTool {
  id: string;
  name: string;
  folder?: string;
  description: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers: { key: string; value: string }[];
  body: string;
  responseFilter: string;
  parameters: MCPParameter[];
  responseFields: MCPResponseField[];
  createdAt: number;
}

export interface MCPParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
}

export interface MCPResponseField {
  id?: string;
  name: string;
  path: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  example?: string;
  children?: MCPResponseField[];
}

export interface ExecutionLog {
  id: string;
  toolId: string;
  timestamp: number;
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
  };
  response: {
    status: number;
    data: any;
    filteredData: any;
  };
}
