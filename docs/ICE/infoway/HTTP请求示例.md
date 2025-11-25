# HTTP请求示例

{% tabs %}
{% tab title="Go" %}

```go
package main

import (
    "fmt"
    "io/ioutil"
    "net/http"
)

func main() {
    apiUrl := "https://data.infoway.io/stock/batch_kline/1/10/002594.SZ%2C00285.HK%2CTSLA.US"

    // 创建HTTP客户端
    client := &http.Client{}

    // 创建GET请求
    req, err := http.NewRequest("GET", apiUrl, nil)
    if err != nil {
        fmt.Println("Error creating request:", err)
        return
    }

    // 设置请求头
    req.Header.Set("User-Agent", "Mozilla/5.0")
    req.Header.Set("Accept", "application/json")
    req.Header.Set("apiKey", "yourApikey")

    // 发送请求
    resp, err := client.Do(req)
    if err != nil {
        fmt.Println("Error sending request:", err)
        return
    }
    defer resp.Body.Close()

    // 读取响应内容
    body, err := ioutil.ReadAll(resp.Body)
    if err != nil {
        fmt.Println("Error reading response:", err)
        return
    }

    // 输出结果
    fmt.Printf("HTTP code:", resp.StatusCode)
    fmt.Printf("message:", string(body))
}
```

{% endtab %}

{% tab title="Java" %}

```java
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class HttpExample {
    public static void main(String[] args) {
        try {
            // 定义请求URL
            String apiUrl = "https://data.infoway.io/stock/batch_kline/1/10/002594.SZ%2C00285.HK%2CTSLA.US";
            URL url = new URL(apiUrl);

            // 创建HTTP连接
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();

            // 设置请求方法为GET
            connection.setRequestMethod("GET");

            // 设置请求头（可选）
            connection.setRequestProperty("User-Agent", "Mozilla/5.0");
            connection.setRequestProperty("Accept", "application/json");

            connection.setRequestProperty("apiKey","yourApikey");

            // 获取响应码
            int responseCode = connection.getResponseCode();
            System.out.println("HTTP code: " + responseCode);

            // 读取响应内容
            BufferedReader reader;
            if (responseCode == HttpURLConnection.HTTP_OK) {
                reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
            } else {
                reader = new BufferedReader(new InputStreamReader(connection.getErrorStream()));
            }

            String line;
            StringBuilder response = new StringBuilder();

            while ((line = reader.readLine()) != null) {
                response.append(line);
            }

            reader.close();

            // 打印响应内容
            System.out.println("message: " + response);

        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
```

{% endtab %}

{% tab title="PHP" %}

```php
<?php
$apiUrl = 'https://data.infoway.io/stock/batch_kline/1/10/002594.SZ%2C00285.HK%2CTSLA.US';

// 初始化cURL会话
$ch = curl_init();

// 设置URL和其他选项
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: Mozilla/5.0',
    'Accept: application/json',
    'apiKey: yourApikey'
]);

// 执行请求并获取响应
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// 关闭cURL资源
curl_close($ch);

// 输出结果
echo "HTTP code: $httpCode";
echo "message: $response";
?>
```

{% endtab %}

{% tab title="Python" %}

```python
import requests

api_url = 'https://data.infoway.io/stock/batch_kline/1/10/002594.SZ%2C00285.HK%2CTSLA.US'

# 设置请求头
headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    'apiKey': 'yourApikey'
}

# 发送GET请求
response = requests.get(api_url, headers=headers)

# 输出结果
print(f"HTTP code: {response.status_code}")
print(f"message: {response.text}")
```

{% endtab %}
{% endtabs %}
