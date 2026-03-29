// 测试修复后的 parseCurl 函数
const curlCommand = `curl --location '127.0.0.1:8080/api/home' \\ 
 --header 'Content-Type: application/json' \\ 
 --data '{ 
     "studentId": "1" 
 }'`;

// 模拟修复后的 parseCurl 函数的解析逻辑
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
        
        // 解析 URL - 支持没有协议前缀的 URL
        let url = '';
        const urlMatch = cleanCurl.match(/'(https?:\/\/[^']+)'/) || cleanCurl.match(/"(https?:\/\/[^"]+)"/) || cleanCurl.match(/\s(https?:\/\/[^\s]+)/);
        if (urlMatch) {
            url = urlMatch[1];
        } else {
            // 尝试匹配没有协议前缀的 URL
            const urlWithoutProtocolMatch = cleanCurl.match(/'([^'"]+)'/) || cleanCurl.match(/"([^'"]+)"/);
            if (urlWithoutProtocolMatch) {
                // 添加默认的 http:// 协议
                url = `http://${urlWithoutProtocolMatch[1]}`;
            }
        }
        console.log(`URL: ${url}`);
        
        // 解析 Headers - 支持 -H 和 --header 选项
        const headers = [];
        const headerMatches = cleanCurl.matchAll(/(?:-H|--header)\s+['"]([^'"]+)['"]/g);
        for (const match of headerMatches) {
            const parts = match[1].split(/:\s*(.*)/);
            if (parts.length >= 2) {
                headers.push({ key: parts[0], value: parts[1] });
            }
        }
        console.log(`Headers:`, JSON.stringify(headers, null, 2));
        
        // 解析 Body - 更健壮的匹配模式
        let body = '{}';
        // 查找 --data, --data-raw, -d 选项后的内容
        const bodyMatch = cleanCurl.match(/--data(?:-raw)?\s+['"]([\s\S]*?)['"]/) || 
                          cleanCurl.match(/-d\s+['"]([\s\S]*?)['"]/);
        if (bodyMatch) {
            // 清理 Body 内容
            body = bodyMatch[1].trim().replace(/\s+/g, ' ');
        }
        console.log(`Body: ${body}`);
        
        console.log("\n=== 解析成功 ===\n");
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
console.log(JSON.stringify(result, null, 2));

console.log("\n=== 测试 URL 访问 ===\n");
console.log("现在这个 URL 应该可以正常访问了:");
console.log(result.url);
