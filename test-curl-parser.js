// 测试 parseCurl 函数的简单脚本，用于定位问题
const curlCommand = `curl --location '127.0.0.1:8080/api/home' \\ 
 --header 'Content-Type: application/json' \\ 
 --data '{ 
     "studentId": "1" 
 }'`;

// 模拟 parseCurl 函数的解析逻辑
function testParseCurl(curlString) {
    console.log("原始 curl 命令:");
    console.log(curlString);
    console.log("\n=== 开始解析 ===\n");
    
    try {
        // 清理多行和反斜杠
        const cleanCurl = curlString.replace(/\\\n/g, ' ').replace(/\n/g, ' ').trim();
        console.log("清理后的 curl 命令:");
        console.log(cleanCurl);
        console.log();
        
        // 解析 Method
        const methodMatch = cleanCurl.match(/-X\s+([A-Z]+)/i) || cleanCurl.match(/--request\s+([A-Z]+)/i);
        let method = (methodMatch ? methodMatch[1].toUpperCase() : 'GET');
        if (cleanCurl.includes('--data') || cleanCurl.includes('-d ') || cleanCurl.includes('--data-raw')) {
            if (!methodMatch) method = 'POST';
        }
        console.log(`Method: ${method}`);
        
        // 解析 URL
        const urlMatch = cleanCurl.match(/'(https?:\/\/[^']+)'/) || cleanCurl.match(/"(https?:\/\/[^"]+)"/) || cleanCurl.match(/\s(https?:\/\/[^\s]+)/);
        let url = urlMatch ? urlMatch[1] : '';
        console.log(`URL: ${url}`);
        
        // 解析 Headers
        const headers = [];
        const headerMatches = cleanCurl.matchAll(/-H\s+['"]([^'"]+)['"]/g);
        for (const match of headerMatches) {
            const parts = match[1].split(/:\s*(.*)/);
            if (parts.length >= 2) {
                headers.push({ key: parts[0], value: parts[1] });
            }
        }
        console.log(`Headers:`, JSON.stringify(headers, null, 2));
        
        // 解析 Body
        const bodyMatch = cleanCurl.match(/--data(?:-raw)?\s+['"]({[^'"]+})['"]/) || 
                          cleanCurl.match(/-d\s+['"]({[^'"]+})['"]/) ||
                          cleanCurl.match(/--data(?:-raw)?\s+({[^}]+})/) ||
                          cleanCurl.match(/-d\s+({[^}]+})/);
        let body = bodyMatch ? bodyMatch[1] : '{}';
        console.log(`Body: ${body}`);
        
        // 测试 URL 解析问题
        if (!url) {
            console.log("\n=== 问题诊断 ===\n");
            console.log("URL 解析失败！尝试其他匹配模式:");
            // 尝试匹配没有协议前缀的 URL
            const urlWithoutProtocolMatch = cleanCurl.match(/'([^'"]+)'/) || cleanCurl.match(/"([^'"]+)"/);
            if (urlWithoutProtocolMatch) {
                console.log(`找到没有协议前缀的 URL: ${urlWithoutProtocolMatch[1]}`);
                // 添加默认的 http:// 协议
                url = `http://${urlWithoutProtocolMatch[1]}`;
                console.log(`添加协议前缀后: ${url}`);
            }
        }
        
        if (!body) {
            console.log("\nBody 解析失败！尝试其他匹配模式:");
            const bodyWithoutBraceMatch = cleanCurl.match(/--data(?:-raw)?\s+['"]([^'"]+)['"]/) || 
                                          cleanCurl.match(/-d\s+['"]([^'"]+)['"]/);
            if (bodyWithoutBraceMatch) {
                console.log(`找到 Body: ${bodyWithoutBraceMatch[1]}`);
                body = bodyWithoutBraceMatch[1];
            }
        }
        
        console.log("\n=== 修复后的解析结果 ===\n");
        console.log(`Method: ${method}`);
        console.log(`URL: ${url}`);
        console.log(`Headers:`, JSON.stringify(headers, null, 2));
        console.log(`Body: ${body}`);
        
        return {
            method,
            url,
            headers,
            body
        };
    } catch (err) {
        console.error("解析失败:", err);
        return null;
    }
}

// 运行测试
const result = testParseCurl(curlCommand);

console.log("\n=== 最终结果 ===\n");
console.log(result);
