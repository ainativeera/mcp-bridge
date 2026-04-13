import type { MCPParameter, MCPResponseField, MCPTool } from '../types';

function flattenResponseFieldTree(fields: MCPResponseField[], result: MCPResponseField[] = []) {
  fields.forEach((field) => {
    if (field.name !== 'root') {
      result.push(field);
    }
    if (field.children?.length) {
      flattenResponseFieldTree(field.children, result);
    }
  });
  return result;
}

export function getResponseFieldSummary(responseFields: MCPResponseField[]) {
  return flattenResponseFieldTree(responseFields || []).filter((field) => !['root', 'item'].includes(field.name));
}

function responseFieldToSchema(field: MCPResponseField): any {
  const description = field.description || undefined;

  if (field.type === 'object') {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    (field.children || []).forEach((child) => {
      if (!child?.name || child.name === 'item') {
        return;
      }
      properties[child.name] = responseFieldToSchema(child);
      if (child.required) {
        required.push(child.name);
      }
    });

    return {
      type: 'object',
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
      ...(required.length > 0 ? { required } : {}),
      ...(description ? { description } : {})
    };
  }

  if (field.type === 'array') {
    const itemField = (field.children || []).find((child) => child?.name === 'item') || field.children?.[0];
    return {
      type: 'array',
      ...(itemField ? { items: responseFieldToSchema(itemField) } : {}),
      ...(description ? { description } : {})
    };
  }

  return {
    type: field.type || 'string',
    ...(description ? { description } : {})
  };
}

export function buildMcpOutputSchema(responseFields: MCPResponseField[]) {
  if (!Array.isArray(responseFields) || responseFields.length === 0) {
    return undefined;
  }

  const firstField = responseFields[0];
  const hasTreeShape = Array.isArray(firstField?.children) || firstField?.name === 'root';

  if (hasTreeShape) {
    if (firstField.name === 'root') {
      return responseFieldToSchema(firstField);
    }
    return {
      type: 'object',
      properties: Object.fromEntries(
        responseFields
          .filter((field) => field?.name)
          .map((field) => [field.name, responseFieldToSchema(field)])
      )
    };
  }

  const properties: Record<string, any> = {};
  responseFields.forEach((field) => {
    if (field?.name) {
      properties[field.name] = {
        type: field.type,
        ...(field.description ? { description: field.description } : {})
      };
    }
  });

  return Object.keys(properties).length > 0 ? { type: 'object', properties } : undefined;
}

export function buildMcpInputSchema(parameters: MCPParameter[]) {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  (parameters || []).forEach((param) => {
    properties[param.name] = {
      type: param.type,
      ...(param.description ? { description: param.description } : {})
    };
    if (param.required) {
      required.push(param.name);
    }
  });

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {})
  };
}

export function buildMcpToolDescription(input: Pick<MCPTool, 'description' | 'parameters' | 'responseFields'> | {
  description?: string;
  parameters?: MCPParameter[];
  responseFields?: MCPResponseField[];
}) {
  const lines: string[] = [];
  const description = input.description?.trim();
  const parameters = input.parameters || [];
  const requiredParams = parameters.filter((param) => param.required);
  const optionalParams = parameters.filter((param) => !param.required);
  if (description) {
    lines.push('用途');
    lines.push(description);
  }

  if (requiredParams.length > 0) {
    lines.push('');
    lines.push('必填参数');
    requiredParams.forEach((param) => {
      lines.push(`- ${param.name} (${param.type}): ${param.description || '未填写说明'}`);
    });
  }

  if (optionalParams.length > 0) {
    lines.push('');
    lines.push('可选参数');
    optionalParams.forEach((param) => {
      lines.push(`- ${param.name} (${param.type}): ${param.description || '未填写说明'}`);
    });
  }

  return lines.join('\n');
}

export function buildMcpToolDefinition(tool: Pick<MCPTool, 'name' | 'description' | 'parameters' | 'responseFields'>) {
  return {
    name: tool.name,
    description: buildMcpToolDescription(tool),
    inputSchema: buildMcpInputSchema(tool.parameters || []),
    outputSchema: buildMcpOutputSchema(tool.responseFields || [])
  };
}
