package com.stickfight.arena

import android.annotation.SuppressLint
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.zxing.integration.android.IntentIntegrator
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * StickFight Arena — native Android controller (Kotlin UI/logic + Java helpers).
 * Screens: splash → home → pairing → char select → controller → result.
 * Sends analog input + actions to the Node.js server over Socket.io.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var root: FrameLayout
    private val handler = Handler(Looper.getMainLooper())

    // ---- state ----
    private var slot = -1
    private var name = ""
    private var pingMs = 0
    private var joystickAx = 0f
    private var joystickAy = 0f
    private var heldBlock = false
    private var heldRB = false
    private var lefty = false
    private var btnScale = 1f
    private var hapticsOn = true
    private var gesturesOn = true

    private lateinit var prefs: android.content.SharedPreferences
    private lateinit var shakeDetector: ShakeDetector
    private val emotes = arrayOf("😤", "🔥", "👏", "💀", "😱", "❤️", "🤡", "😈")
    private var emoteIdx = 0

    private var inputTimer: Runnable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = getSharedPreferences("sfa", MODE_PRIVATE)
        SoundHelper.init()
        name = "FIGHTER_" + (1000..9999).random()
        lefty = prefs.getBoolean("lefty", false)
        btnScale = prefs.getFloat("btnSize", 1f)
        hapticsOn = prefs.getBoolean("haptics", true)
        gesturesOn = prefs.getBoolean("gestures", true)

        root = FrameLayout(this)
        setContentView(root)
        showSplash()

        shakeDetector = ShakeDetector(this) {
            if (slot >= 0) {
                SocketManager.sendAction(GameProtocol.ACT_RAGE)
                HapticHelper.victory(this)
                toast("😡 RAGE MODE!")
            }
        }

        SocketManager.onEvent = { ev, data -> runOnUiThread { handleSocket(ev, data) } }
        SocketManager.connect(serverUrl())
        handler.post(object : Runnable {
            override fun run() {
                if (SocketManager.connected) SocketManager.ping()
                handler.postDelayed(this, 2000)
            }
        })
    }

    private fun serverUrl(): String {
        val saved = prefs.getString("server", "") ?: ""
        return if (saved.isNotEmpty()) saved else "http://10.0.2.2:3000"
    }

    /* ---------------- screens ---------------- */
    private fun setScreen(layout: Int) {
        root.removeAllViews()
        val v = LayoutInflater.from(this).inflate(layout, root, false)
        root.addView(v)
        when (layout) {
            R.layout.screen_home -> bindHome(v)
            R.layout.screen_pair -> bindPair(v)
            R.layout.screen_charsel -> bindCharSelect(v)
            R.layout.screen_controller -> bindController(v)
            R.layout.screen_result -> bindResult(v)
        }
    }
    private fun showSplash() {
        setScreen(R.layout.screen_splash)
        val badge = findViewById<TextView>(R.id.splash_badge)
        badge.animate().alpha(1f).setStartDelay(1500).setDuration(400).start()
        HapticHelper.victory(this)
        handler.postDelayed({
            val joined = prefs.getInt("joined", -1) == 0
            if (joined && SocketManager.connected) setScreen(R.layout.screen_charsel)
            else setScreen(R.layout.screen_home)
        }, 2400)
    }

    private fun bindHome(v: View) {
        v.findViewById<TextView>(R.id.home_conn).text = if (SocketManager.connected) "🟢 connected" else "🔴 offline"
        v.findViewById<Button>(R.id.btn_join).setOnClickListener {
            HapticHelper.tap(this)
            setScreen(R.layout.screen_pair)
        }
        v.findViewById<Button>(R.id.btn_settings_home).setOnClickListener { showSettings() }
        v.findViewById<Button>(R.id.btn_how).setOnClickListener { toast("Code from PC → Fight! Swipe up to jump, shake for Rage!") }
    }

    @SuppressLint("SetTextI18n")
    private fun bindPair(v: View) {
        val codeInput = v.findViewById<EditText>(R.id.input_code)
        val serverInput = v.findViewById<EditText>(R.id.input_server)
        serverInput.setText(prefs.getString("server", ""))
        v.findViewById<Button>(R.id.btn_enter).setOnClickListener {
            val c = codeInput.text.toString().trim()
            if (c.isEmpty()) { toast("Enter the room code"); return@setOnClickListener }
            HapticHelper.tap(this)
            join(c)
        }
        v.findViewById<Button>(R.id.btn_scan).setOnClickListener {
            IntentIntegrator(this)
                .setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
                .setPrompt("Scan the QR on the big screen")
                .setBeepEnabled(false)
                .setOrientationLocked(true)
                .initiateScan()
        }
        v.findViewById<Button>(R.id.btn_detect).setOnClickListener { detectNearby(v) }
        v.findViewById<Button>(R.id.btn_save_server).setOnClickListener {
            val url = serverInput.text.toString().trim()
            if (url.isEmpty()) { toast("Enter server address"); return@setOnClickListener }
            prefs.edit().putString("server", url).apply()
            toast("Server saved — reconnecting…")
            SocketManager.connect(url)
        }
        v.findViewById<Button>(R.id.btn_back_home).setOnClickListener { setScreen(R.layout.screen_home) }
        // show detected rooms
        val result = v.findViewById<TextView>(R.id.detect_result)
        prefs.getString("server", "")?.let { if (it.isNotEmpty()) result.text = "server: $it" }
    }

    private fun detectNearby(v: View) {
        val base = serverUrl()
        val label = v.findViewById<TextView>(R.id.detect_result)
        label.text = "scanning $base…"
        thread {
            try {
                val conn = URL("$base/api/rooms").openConnection() as HttpURLConnection
                conn.connectTimeout = 4000
                conn.readTimeout = 4000
                val body = conn.inputStream.bufferedReader().readText()
                val arr = JSONArray(body)
                runOnUiThread {
                    if (arr.length() == 0) label.text = "no open games on $base"
                    else {
                        val sb = StringBuilder()
                        for (i in 0 until arr.length()) {
                            val r = arr.getJSONObject(i)
                            sb.append("🥊 ").append(r.getString("code"))
                                .append("  · ").append(r.optInt("players", 0)).append("/")
                                .append(if (r.optString("mode", "1v1").startsWith("tournament")) "4" else "2")
                                .append(" players\n")
                        }
                        label.text = sb.toString().trim()
                        showRoomPicker(arr)
                    }
                }
            } catch (e: Exception) {
                runOnUiThread { label.text = "unreachable — save the server address first" }
            }
        }
    }

    private fun showRoomPicker(arr: JSONArray) {
        val names = (0 until arr.length()).map { arr.getJSONObject(it).getString("code") }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Nearby games")
            .setItems(names) { _, which -> join(names[which]) }
            .show()
    }

    private fun join(code: String) {
        val obj = JSONObject()
        obj.put("code", code)
        obj.put("name", name)
        SocketManager.emit("join", obj)
        prefs.edit().putInt("joined", 0).apply()
        toast("Joining " + code + "…")
    }

    /* ---------------- character select ---------------- */
    @SuppressLint("SetTextI18n")
    private fun bindCharSelect(v: View) {
        val grid = v.findViewById<GridLayout>(R.id.chars_grid)
        grid.removeAllViews()
        for (i in GameProtocol.CHARS.indices) {
            val cell = LayoutInflater.from(this).inflate(R.layout.cell_char, grid, false)
            cell.findViewById<TextView>(R.id.cell_emoji).text = GameProtocol.CHAR_EMOJI[i]
            cell.findViewById<TextView>(R.id.cell_name).text = GameProtocol.CHAR_NAMES[i]
            cell.findViewById<TextView>(R.id.cell_name).setTextColor(android.graphics.Color.parseColor(GameProtocol.CHAR_COLORS[i]))
            cell.findViewById<TextView>(R.id.cell_style).text = GameProtocol.CHAR_STYLES[i]
            val charId = GameProtocol.CHARS[i]
            cell.setOnClickListener {
                HapticHelper.tap(this)
                SocketManager.emit("char:select", charId)
                grid.removeView(cell)
                cell.alpha = 1f
                grid.addView(cell, grid.indexOfChild(cell)) // keep position
                cell.setBackgroundResource(R.drawable.btn_gold)
                for (i in 0 until grid.childCount) { val ch = grid.getChildAt(i); if (ch !== cell) ch.setBackgroundResource(R.drawable.btn_panel) }
            }
            grid.addView(cell)
        }
        v.findViewById<Button>(R.id.btn_lock).setOnClickListener {
            SocketManager.emit("char:lock", true)
            HapticHelper.round(this)
            toast("Locked in — waiting for the fight!")
        }
    }

    /* ---------------- controller ---------------- */
    @SuppressLint("ClickableViewAccessibility", "SetTextI18n")
    private fun bindController(v: View) {
        v.findViewById<TextView>(R.id.ctrl_name).text = (if (slot == 0) "🔴 P1" else "🔵 P2") + " · " + name
        // left-handed mirror
        val ctrlRoot = v.findViewById<LinearLayout>(R.id.ctrl_root)
        ctrlRoot.scaleX = if (lefty) -1f else 1f
        // scale buttons
        v.findViewById<View>(R.id.abxy).scaleX = btnScale
        v.findViewById<View>(R.id.abxy).scaleY = btnScale
        v.findViewById<TextView>(R.id.ctrl_ping).text = "—"

        val joy = v.findViewById<JoystickView>(R.id.joystick)
        joy.onMove = { ax, ay -> joystickAx = ax; joystickAy = ay }
        joy.onJumpFlick = { SocketManager.sendAction(GameProtocol.ACT_JUMP); HapticHelper.tap(this) }
        joy.onRelease = { joystickAx = 0f; joystickAy = 0f }

        // ABXY
        bindTap(v, R.id.btnA) { SocketManager.sendAction(GameProtocol.ACT_LIGHT) }
        bindTap(v, R.id.btnB) { SocketManager.sendAction(GameProtocol.ACT_KICK) }
        bindTap(v, R.id.btnX) { SocketManager.sendAction(GameProtocol.ACT_HEAVY) }
        bindTap(v, R.id.btnY) { SocketManager.sendAction(GameProtocol.ACT_SPECIAL) }
        // actions
        bindTap(v, R.id.btn_grab) { SocketManager.sendAction(GameProtocol.ACT_GRAB) }
        bindTap(v, R.id.btn_dash) { SocketManager.sendAction(GameProtocol.ACT_DASH) }
        bindTap(v, R.id.btn_special) { SocketManager.sendAction(GameProtocol.ACT_SPECIAL) }
        bindHold(v, R.id.btn_block,
            onDown = { heldBlock = true; SocketManager.sendAction(GameProtocol.ACT_BLOCK_ON) },
            onUp = { heldBlock = false; SocketManager.sendAction(GameProtocol.ACT_BLOCK_OFF) })
        // special double-tap = ultimate
        var lastSpecTap = 0L
        v.findViewById<TextView>(R.id.btn_special).setOnClickListener {
            val now = System.currentTimeMillis()
            if (now - lastSpecTap < 380) { SocketManager.sendAction(GameProtocol.ACT_ULT); HapticHelper.victory(this) }
            lastSpecTap = now
        }
        // util
        v.findViewById<TextView>(R.id.btn_emote).setOnClickListener {
            emoteIdx = (emoteIdx + 1) % emotes.size
            (v.findViewById<TextView>(R.id.btn_emote)).text = emotes[emoteIdx]
            SocketManager.emit("emote", emotes[emoteIdx])
            HapticHelper.tap(this)
        }
        v.findViewById<TextView>(R.id.btn_pause).setOnClickListener { SocketManager.emit("pause"); HapticHelper.tap(this) }
        v.findViewById<TextView>(R.id.btn_settings).setOnClickListener { showSettings() }

        // gesture zone: swipe up/down/left/right + double tap
        val gz = v.findViewById<View>(R.id.gesture_zone)
        val gd = GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                if (!gesturesOn || slot < 0) return false
                val dx = e2.x - (e1?.x ?: e2.x)
                val dy = e2.y - (e1?.y ?: e2.y)
                return if (Math.abs(dy) > Math.abs(dx)) {
                    SocketManager.sendAction(if (dy < 0) GameProtocol.ACT_JUMP else GameProtocol.ACT_SLIDE)
                    HapticHelper.tap(this@MainActivity)
                    true
                } else if (Math.abs(dx) > 60) {
                    SocketManager.sendAction(if (dx > 0) GameProtocol.ACT_DASH else GameProtocol.ACT_DODGE)
                    HapticHelper.tap(this@MainActivity)
                    true
                } else false
            }
            override fun onDoubleTap(e: MotionEvent): Boolean {
                if (!gesturesOn || slot < 0) return false
                SocketManager.sendAction(GameProtocol.ACT_DODGE)
                HapticHelper.tap(this@MainActivity)
                return true
            }
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                if (!gesturesOn || slot < 0) return false
                SocketManager.sendAction(GameProtocol.ACT_TAUNT, JSONObject().put("emoji", "😤"))
                return true
            }
        })
        gz.setOnTouchListener { _, e -> gd.onTouchEvent(e); true }

        // 20Hz input sender
        inputTimer?.let { handler.removeCallbacks(it) }
        inputTimer = object : Runnable {
            override fun run() {
                if (slot >= 0 && SocketManager.connected) {
                    SocketManager.sendInput(joystickAx, joystickAy, heldBlock, heldRB)
                }
                handler.postDelayed(this, 50)
            }
        }
        handler.post(inputTimer!!)

        shakeDetector.attach()
    }

    private fun bindTap(v: View, id: Int, fn: () -> Unit) {
        v.findViewById<TextView>(id).setOnClickListener {
            if (hapticsOn) { HapticHelper.tap(this); SoundHelper.tap() }
            fn()
        }
    }
    private fun bindHold(v: View, id: Int, onDown: () -> Unit, onUp: () -> Unit) {
        val tv = v.findViewById<TextView>(id)
        tv.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { if (hapticsOn) { HapticHelper.tap(this); SoundHelper.tap() }; tv.alpha = 0.6f; onDown() }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { tv.alpha = 1f; onUp() }
            }
            true
        }
    }

    /* ---------------- result ---------------- */
    @SuppressLint("SetTextI18n")
    private fun bindResult(v: View) {
        v.findViewById<Button>(R.id.btn_res_home).setOnClickListener {
            slot = -1
            setScreen(R.layout.screen_home)
        }
    }

    /* ---------------- settings ---------------- */
    private fun showSettings() {
        val items = arrayOf(
            "Left-handed mode: ${if (lefty) "ON" else "OFF"}",
            "Button size: ${if (btnScale < 1f) "S" else if (btnScale > 1f) "L" else "M"}",
            "Haptics: ${if (hapticsOn) "ON" else "OFF"}",
            "Gestures: ${if (gesturesOn) "ON" else "OFF"}"
        )
        AlertDialog.Builder(this)
            .setTitle("⚙️ SETTINGS")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> { lefty = !lefty; prefs.edit().putBoolean("lefty", lefty).apply(); showSettings() }
                    1 -> { btnScale = if (btnScale < 1f) 1f else if (btnScale > 1f) 0.8f else 1.2f; prefs.edit().putFloat("btnSize", btnScale).apply(); showSettings() }
                    2 -> { hapticsOn = !hapticsOn; prefs.edit().putBoolean("haptics", hapticsOn).apply(); showSettings() }
                    3 -> { gesturesOn = !gesturesOn; prefs.edit().putBoolean("gestures", gesturesOn).apply(); showSettings() }
                }
                if (which == 0) setScreen(R.layout.screen_controller)
            }
            .setNegativeButton("DONE", null)
            .show()
    }

    /* ---------------- socket handling ---------------- */
    @SuppressLint("SetTextI18n")
    private fun handleSocket(ev: String, data: Any?) {
        when (ev) {
            "connect" -> { toast("🟢 connected"); val h = findViewById<TextView>(R.id.home_conn); h?.text = "🟢 connected" }
            "disconnect" -> { toast("🔴 offline"); val h = findViewById<TextView>(R.id.home_conn); h?.text = "🔴 offline" }
            "pong" -> { pingMs = data as? Int ?: 0; findViewById<TextView>(R.id.ctrl_ping)?.text = "${pingMs}ms" }
            "joined" -> {
                val j = data as? JSONObject ?: return
                slot = j.optInt("slot", -1)
                if (j.optBoolean("spectate", false)) {
                    toast("👀 Spectator mode")
                    return
                }
                if (j.optString("state", "") == "charselect") setScreen(R.layout.screen_charsel)
                else setScreen(R.layout.screen_controller)
                HapticHelper.round(this)
            }
            "room:state" -> {
                val rs = data as? JSONObject ?: return
                if (slot >= 0 && rs.optString("state") == "charselect") setScreen(R.layout.screen_charsel)
            }
            "match:start" -> setScreen(R.layout.screen_controller)
            "match:state" -> {
                val snap = data as? JSONObject ?: return
                val f = snap.optJSONArray("f") ?: return
                if (slot in 0 until f.length()) {
                    val me = f.getJSONObject(slot)
                    val hp = me.optDouble("hp", 100.0)
                    val combo = me.optInt("combo", 0)
                    findViewById<ProgressBar>(R.id.ctrl_hp)?.progress = hp.toInt()
                    findViewById<TextView>(R.id.ctrl_combo)?.text = if (combo > 1) "${combo}x" else ""
                }
            }
            "match:event" -> {
                val ev2 = data as? JSONObject ?: return
                val d = ev2.optJSONObject("data") ?: return
                when (ev2.optString("kind")) {
                    "hit" -> {
                        val target = d.optInt("target", -1)
                        val p = d.optInt("p", -1)
                        if (hapticsOn) {
                            if (target == slot) { HapticHelper.buzz(this); SoundHelper.buzz() }
                            else if (p == slot) { HapticHelper.tap(this); SoundHelper.tap() }
                        }
                    }
                    "combo" -> if (d.optInt("p", -1) == slot && hapticsOn) { HapticHelper.combo(this, d.optInt("count", 3)); SoundHelper.tap() }
                    "ko" -> if (hapticsOn) {
                        if (d.optInt("winner", -1) == slot) { HapticHelper.victory(this); SoundHelper.victory() }
                        else { HapticHelper.heavy(this); SoundHelper.ko() }
                    }
                    "fight" -> if (hapticsOn) HapticHelper.tap(this)
                    "special", "ult", "grab", "throw", "freeze", "rage" -> if (d.optInt("p", -1) == slot && hapticsOn) HapticHelper.heavy(this)
                }
            }
            "match:end" -> {
                val d = data as? JSONObject ?: return
                val winner = d.optInt("winner", -1)
                val title = findViewById<TextView>(R.id.res_title)
                title.text = if (winner == slot) "VICTORY 🏆" else "DEFEAT"
                title.setTextColor(if (winner == slot) 0xFFFFD700.toInt() else 0xFFFF2D2D.toInt())
                findViewById<TextView>(R.id.res_sub).text = if (winner == slot) "You dominated the arena!" else "Better luck next round…"
                if (hapticsOn) {
                    if (winner == slot) { HapticHelper.victory(this); SoundHelper.victory() }
                    else { HapticHelper.heavy(this); SoundHelper.ko() }
                }
                shakeDetector.detach()
                inputTimer?.let { handler.removeCallbacks(it) }
                setScreen(R.layout.screen_result)
            }
        }
    }

    /* ---------------- QR result ---------------- */
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data)
        if (result != null && result.contents != null) {
            val code = GameProtocol.codeFromQr(result.contents)
            if (code != null) {
                HapticHelper.tap(this)
                join(code)
                toast("Scanned: $code")
            } else toast("No room code in QR")
        }
    }

    override fun onPause() {
        super.onPause()
        shakeDetector.detach()
        inputTimer?.let { handler.removeCallbacks(it) }
    }
    override fun onResume() {
        super.onResume()
        if (::shakeDetector.isInitialized) shakeDetector.attach()
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }
}
