# Websocket代码示例
WebSocket代码示例，获取实时成交明细、盘口、k线。包括自动重连，心跳检测机制。

{% tabs %}
{% tab title="Java" %}

```java
package org.example.ws;

import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import jakarta.annotation.PostConstruct;
import jakarta.websocket.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@ClientEndpoint
@Slf4j
@Component
public class WebsocketExample {

    //本地session通道
    private static Session session;

    //wss连接地址 business可以为stock、crypto、common；apikey为您的凭证
    private static final String WS_URL = "wss://data.infoway.io/ws?business=crypto&apikey=yourApikey";

    @PostConstruct
    public void connectAll() {
        try {
            //建立WEBSOCKET连接
            connect(WS_URL);
            //开启自动重连
            startReconnection(WS_URL);
        } catch (Exception e) {
            log.error("Failed to connect to " + WS_URL + ": " + e.getMessage());
        }
    }

    //自动重连机制，会开启一个定时线程判断连接是否断开，断开自动重连
    private void startReconnection(String s) {
        ScheduledExecutorService usExecutor = Executors.newScheduledThreadPool(1);
        Runnable usTask = () -> {
            if (session == null || !session.isOpen()) {
                log.debug("reconnection...");
                connect(s);
            }
        };
        usExecutor.scheduleAtFixedRate(usTask, 1000, 10000, TimeUnit.MILLISECONDS);
    }

    //建立WEBSOCKET连接具体实现
    private void connect(String s) {
        try {
            WebSocketContainer container = ContainerProvider.getWebSocketContainer();
            session = container.connectToServer(WebsocketExample.class, URI.create(s));
        } catch (DeploymentException | IOException e) {
            log.error("Failed to connect to the server: {}", e.getMessage());
        }
    }

    //WEBSOCKET连接建立成功后会执行下面的方法
    @OnOpen
    public void onOpen(Session session) throws IOException, InterruptedException {
        //WEBSOCKET连接建立成功会执行该方法
        System.out.println("Connection opened: " + session.getId());

        // 发送实时成交明细订阅请求
        JSONObject tradeSendObj = new JSONObject();
        //参考WEBSOCKET API 里面的不同请求的协议号，1000为订阅实时交易明细数据，文档：https://docs.infoway.io/websocket-api/subscribe-and-unsubscribe/trade-subscribe
        tradeSendObj.put("code", 10000);
        //自定义trace
        tradeSendObj.put("trace", "01213e9d-90a0-426e-a380-ebed633cba7a");
        //封装订阅请求实体，json格式
        JSONObject data = new JSONObject();
        //订阅BTCUSDT
        data.put("codes", "BTCUSDT");
        tradeSendObj.put("data", data);
        //发送实时成交明细订阅请求
        session.getBasicRemote().sendText(tradeSendObj.toJSONString());

        //-----------------------------------------------------------------//
        //不同请求之间间隔一段时间
        Thread.sleep(5000);

        //发送实时盘口数据订阅请求，文档：https://docs.infoway.io/websocket-api/subscribe-and-unsubscribe/depth-subscribe
        JSONObject depthSendObj = new JSONObject();
        //参考WEBSOCKET API 里面的不同请求的协议号，1003为订阅实时盘口数据
        depthSendObj.put("code", 10003);
        //自定义trace
        depthSendObj.put("trace", "01213e9d-90a0-426e-a380-ebed633cba7a");
        //封装订阅请求实体，json格式
        depthSendObj.put("data", data);
        //发送实时成交明细订阅请求
        session.getBasicRemote().sendText(depthSendObj.toJSONString());

        
        //-----------------------------------------------------------------//
        //不同请求之间间隔一段时间
        Thread.sleep(5000);

        //发送实时k线数据订阅请求，文档：https://docs.infoway.io/websocket-api/subscribe-and-unsubscribe/candles-subscribe
        JSONObject klineSendObj = new JSONObject();
        //参考WEBSOCKET API 里面的不同请求的协议号，1006为订阅K线数据
        klineSendObj.put("code", 10006);
        //自定义trace
        klineSendObj.put("trace", "01213e9d-90a0-426e-a380-ebed633cba7a");
        //封装订阅请求实体，json格式
        JSONObject klineData = new JSONObject();
        JSONArray klineDataArray = new JSONArray();

        //封装订阅1分钟k线的实体
        JSONObject kline1minObj = new JSONObject();
        //type就是klineType
        kline1minObj.put("type", 1);
        kline1minObj.put("codes", "BTCUSDT");
        klineDataArray.add(kline1minObj);
        klineData.put("arr", klineDataArray);

        klineSendObj.put("data", klineData);
        //发送实时成交明细订阅请求
        session.getBasicRemote().sendText(klineSendObj.toJSONString());

        //定时发送心跳任务，文档：https://docs.infoway.io/websocket-api/heartbeat
        ScheduledExecutorService pingExecutor = Executors.newScheduledThreadPool(1);
        Runnable pingTask = WebsocketExample::ping;
        pingExecutor.scheduleAtFixedRate(pingTask, 30, 30, TimeUnit.SECONDS);

    }

    @OnMessage
    public void onMessage(String message, Session session) {
        //会接收INFOWAY服务端返回的数据，包含订阅成功或失败的提示，以及正式的行情数据推送
        try {
            System.out.println("Message received: " + message);
        } catch (Exception e) {
        }
    }

    @OnClose
    public void onClose(Session session, CloseReason reason) {
        //WEBSOCKET连接关闭会回调该方法
        System.out.println("Connection closed: " + session.getId() + ", reason: " + reason);
    }

    @OnError
    public void onError(Throwable error) {
        error.printStackTrace();
    }

    //持续性发送心跳，防止服务端长时间检查不到心跳请求关闭连接
    public static void ping() {
        try {
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("code", 10010);
            jsonObject.put("trace", "01213e9d-90a0-426e-a380-ebed633cba7a");
            session.getBasicRemote().sendText(jsonObject.toJSONString());
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

}

```

{% endtab %}

{% tab title="Python" %}

```python
import json
import time
import schedule
import threading
import websocket
from loguru import logger

class WebsocketExample:
    def __init__(self):
        self.session = None
        self.ws_url = "wss://data.infoway.io/ws?business=crypto&apikey=yourApikey"
        self.reconnecting = False
        self.is_ws_connected = False  # 添加连接状态标志

    def connect_all(self):
        """建立WebSocket连接并启动自动重连机制"""
        try:
            self.connect(self.ws_url)
            self.start_reconnection(self.ws_url)
        except Exception as e:
            logger.error(f"Failed to connect to {self.ws_url}: {str(e)}")

    def start_reconnection(self, url):
        """启动定时重连检查"""
        def check_connection():
            if not self.is_connected():
                logger.debug("Reconnection attempt...")
                self.connect(url)
        
        # 使用线程定期检查连接状态
        schedule.every(10).seconds.do(check_connection)
        def run_scheduler():
            while True:
                schedule.run_pending()
                time.sleep(1)
        threading.Thread(target=run_scheduler, daemon=True).start()

    def is_connected(self):
        """检查WebSocket连接状态"""
        return self.session and self.is_ws_connected

    def connect(self, url):
        """建立WebSocket连接"""
        try:
            if self.is_connected():
                self.session.close()
            
            self.session = websocket.WebSocketApp(
                url,
                on_open=self.on_open,
                on_message=self.on_message,
                on_error=self.on_error,
                on_close=self.on_close
            )
            
            # 启动WebSocket连接（非阻塞模式）
            threading.Thread(target=self.session.run_forever, daemon=True).start()
        except Exception as e:
            logger.error(f"Failed to connect to the server: {str(e)}")

    def on_open(self, ws):
        """WebSocket连接建立成功后的回调"""
        logger.info(f"Connection opened")
        self.is_ws_connected = True  # 设置连接状态为True
        
        try:
            # 发送实时成交明细订阅请求
            trade_send_obj = {
                "code": 10000,
                "trace": "01213e9d-90a0-426e-a380-ebed633cba7a",
                "data": {"codes": "BTCUSDT"}
            }
            self.send_message(trade_send_obj)
            
            # 不同请求之间间隔一段时间
            time.sleep(5)
            
            # 发送实时盘口数据订阅请求
            depth_send_obj = {
                "code": 10003,
                "trace": "01213e9d-90a0-426e-a380-ebed633cba7a",
                "data": {"codes": "BTCUSDT"}
            }
            self.send_message(depth_send_obj)
            
            # 不同请求之间间隔一段时间
            time.sleep(5)
            
            # 发送实时K线数据订阅请求
            kline_data = {
                "arr": [
                    {
                        "type": 1,
                        "codes": "BTCUSDT"
                    }
                ]
            }
            kline_send_obj = {
                "code": 10006,
                "trace": "01213e9d-90a0-426e-a380-ebed633cba7a",
                "data": kline_data
            }
            self.send_message(kline_send_obj)
            
            # 启动定时心跳任务
            schedule.every(30).seconds.do(self.ping)
            
        except Exception as e:
            logger.error(f"Error sending initial messages: {str(e)}")

    def on_message(self, ws, message):
        """接收消息的回调"""
        try:
            logger.info(f"Message received: {message}")
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")

    def on_close(self, ws, close_status_code, close_msg):
        """连接关闭的回调"""
        logger.info(f"Connection closed: {close_status_code} - {close_msg}")
        self.is_ws_connected = False  # 设置连接状态为False

    def on_error(self, ws, error):
        """错误处理的回调"""
        logger.error(f"WebSocket error: {str(error)}")
        self.is_ws_connected = False  # 发生错误时设置连接状态为False

    def send_message(self, message_obj):
        """发送消息到WebSocket服务器"""
        if self.is_connected():
            try:
                self.session.send(json.dumps(message_obj))
            except Exception as e:
                logger.error(f"Error sending message: {str(e)}")
        else:
            logger.warning("Cannot send message: Not connected")

    def ping(self):
        """发送心跳包"""
        ping_obj = {
            "code": 10010,
            "trace": "01213e9d-90a0-426e-a380-ebed633cba7a"
        }
        self.send_message(ping_obj)

# 使用示例
if __name__ == "__main__":
    ws_client = WebsocketExample()
    ws_client.connect_all()
    
    # 保持主线程运行
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Exiting...")
        if ws_client.is_connected():
            ws_client.session.close()
```

{% endtab %}
{% endtabs %}
