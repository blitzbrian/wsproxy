const WebSocket = require('ws');
const dgram = require('dgram');
const net = require('net');
const url = require('url');
const http = require('http');
const path = require('path');
const express = require('express');
const app = express();
const server = http.createServer(app);

// app.use(express.static(path.join(__dirname, 'public')));

// WebSocket server listening on ws://localhost:3000
const wss = new WebSocket.WebSocketServer({ noServer: true });

wss.on('connection', (ws, req) => {
    // Parse the target host and port from the WebSocket URL
    const parsedUrl = url.parse(req.url);
    const pathParts = parsedUrl.pathname.split('/');

    console.log(pathParts);

    if (pathParts.length < 3) {
        ws.close(1000, "Invalid URL format, expected ws://localhost:3000/u/<host>:<port> or ws://localhost:3000/t/<host>:<port>");
        return;
    }

    const [targetHost, targetPort] = pathParts[2].split(':');
    if (!targetHost || isNaN(targetPort)) {
        ws.close(1000, "Invalid target host or port");
        return;
    }

    const port = parseInt(targetPort);

    if (pathParts[1] === 'u') {
        const udpClient = dgram.createSocket('udp4');

        // Forward WebSocket messages to the UDP target
        ws.on('message', (message) => {
            console.log(`Received WebSocket message, forwarding to ${targetHost}:${port}`);
            udpClient.send(message, port, targetHost, (err) => {
                if (err) {
                    console.error("Error sending UDP message:", err);
                    ws.close(1011, "Error sending UDP message");
                }
            });
        });

        // Relay messages from the UDP target back to the WebSocket client
        udpClient.on('message', (msg, rinfo) => {
            console.log(`Received UDP message from ${rinfo.address}:${rinfo.port}, relaying to WebSocket client`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg);
            }
        });

        // Handle WebSocket close and cleanup UDP socket
        ws.on('close', () => {
            console.log("WebSocket client disconnected, closing UDP socket");
            udpClient.close();
        });

        // Handle WebSocket error
        ws.on('error', (err) => {
            console.error("WebSocket error:", err);
            udpClient.close();
        });

    } else if (pathParts[1] === 't') {
        const tcpClient = new net.Socket();

        // Connect to the TCP target
        tcpClient.connect(port, targetHost, () => {
            console.log(`TCP connection established to ${targetHost}:${port}`);
        });

        // Forward WebSocket messages to the TCP target
        ws.on('message', (message) => {
            console.log(`Received WebSocket message, forwarding to TCP ${targetHost}:${port}`);
            tcpClient.write(message.toString(), (err) => {
                if (err) {
                    console.error("Error sending TCP message:", err);
                    ws.close(1011, "Error sending TCP message");
                }
            });
        });

        // Relay messages from the TCP target back to the WebSocket client
        tcpClient.on('data', (data) => {
            console.log(`Received TCP message from ${targetHost}:${port}, relaying to WebSocket client`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        // Handle TCP errors
        tcpClient.on('error', (err) => {
            console.error("TCP error:", err);
            ws.close(1011, "TCP connection error");
        });

        // Handle WebSocket close and cleanup TCP socket
        ws.on('close', () => {
            console.log("WebSocket client disconnected, closing TCP connection");
            tcpClient.destroy(); // Close the TCP connection
        });

        // Handle WebSocket error
        ws.on('error', (err) => {
            console.error("WebSocket error:", err);
            tcpClient.destroy(); // Close the TCP connection
        });
    }
});

server.on('upgrade', function upgrade(request, socket, head) {
    wss.handleUpgrade(request, socket, head, function done(ws) {
        wss.emit('connection', ws, request);
    });
});

server.listen(3000);

console.log("WebSocket to UDP/TCP proxy server started.");