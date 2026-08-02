package com.stickfight.arena

import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

/**
 * Socket.io connection manager (Kotlin).
 * Talks to the StickFight Arena Node server using the same protocol
 * as the web controller: join / char:select / input / action / emote / ping.
 */
object SocketManager {
    var socket: Socket? = null
        private set

    var connected: Boolean = false
        private set

    /** event name -> handler (called on the main thread by the owner) */
    var onEvent: ((String, Any?) -> Unit)? = null

    fun connect(serverUrl: String) {
        disconnect()
        val opts = IO.Options.builder()
            .setTransports(arrayOf("websocket", "polling"))
            .setReconnection(true)
            .build()
        socket = try {
            IO.socket(URI.create(serverUrl.trimEnd('/')), opts)
        } catch (e: Exception) {
            return
        }
        socket?.on(Socket.EVENT_CONNECT) {
            connected = true
            onEvent?.invoke("connect", null)
        }
        socket?.on(Socket.EVENT_DISCONNECT) {
            connected = false
            onEvent?.invoke("disconnect", null)
        }
        socket?.on("joined") { args -> onEvent?.invoke("joined", args?.firstOrNull()) }
        socket?.on("room:state") { args -> onEvent?.invoke("room:state", args?.firstOrNull()) }
        socket?.on("match:state") { args -> onEvent?.invoke("match:state", args?.firstOrNull()) }
        socket?.on("match:event") { args -> onEvent?.invoke("match:event", args?.firstOrNull()) }
        socket?.on("match:start") { args -> onEvent?.invoke("match:start", args?.firstOrNull()) }
        socket?.on("match:end") { args -> onEvent?.invoke("match:end", args?.firstOrNull()) }
        socket?.on("tournament:update") { args -> onEvent?.invoke("tournament:update", args?.firstOrNull()) }
        socket?.on("tournament:done") { args -> onEvent?.invoke("tournament:done", args?.firstOrNull()) }
        socket?.on("pong") { args ->
            val t = (args?.firstOrNull() as? JSONObject)?.optLong("t", 0L) ?: 0L
            onEvent?.invoke("pong", ((System.currentTimeMillis() - t) / 2).toInt())
        }
        socket?.on("player:ping") { args -> onEvent?.invoke("player:ping", args?.firstOrNull()) }
        socket?.connect()
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        connected = false
    }

    fun emit(event: String, vararg args: Any) {
        socket?.emit(event, *args)
    }

    /** send analog stick + held buttons (20 Hz from the controller) */
    fun sendInput(ax: Float, ay: Float, heldBlock: Boolean, heldRB: Boolean) {
        val held = JSONObject()
        held.put("block", heldBlock)
        held.put("RB", heldRB)
        val obj = JSONObject()
        obj.put("ax", ax.toDouble())
        obj.put("ay", ay.toDouble())
        obj.put("held", held)
        emit("input", obj)
    }

    fun sendAction(name: String, data: JSONObject? = null) {
        val obj = JSONObject()
        obj.put("name", name)
        if (data != null) obj.put("data", data)
        emit("action", obj)
    }

    fun ping() { emit("ping", System.currentTimeMillis()) }
}
