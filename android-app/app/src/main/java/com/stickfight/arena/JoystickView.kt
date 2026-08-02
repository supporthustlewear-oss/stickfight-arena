package com.stickfight.arena

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import kotlin.math.hypot

/**
 * Virtual analog joystick (Kotlin custom view).
 * 360° stick with deadzone; fast upward flick = jump.
 */
class JoystickView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : View(context, attrs) {

    var onMove: ((ax: Float, ay: Float) -> Unit)? = null
    var onJumpFlick: (() -> Unit)? = null
    var onRelease: (() -> Unit)? = null

    private val RADIUS = 130f          // visual radius (px at 2x density)
    private val KNOB = 58f
    private var active = false
    private var ox = 0f
    private var oy = 0f
    private var kx = 0f   // knob offset
    private var ky = 0f
    private var lastFlickY = 0f
    private var flickT = 0L

    private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        shader = RadialGradient(0f, 0f, RADIUS, 0x1Affffff, 0x00ffffff, Shader.TileMode.CLAMP)
    }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 5f
        color = 0x38ffffff
    }
    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        shader = RadialGradient(0f, 0f, KNOB / 2, 0xFF4a4a6a.toInt(), 0xFF1c1c2e.toInt(), Shader.TileMode.CLAMP)
    }
    private val knobRing = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 5f
        color = 0x5Affffff
    }

    override fun onMeasure(w: Int, h: Int) {
        val d = (RADIUS * 2.4f).toInt()
        setMeasuredDimension(resolveSize(d, w), resolveSize(d, h))
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        canvas.save()
        canvas.translate(cx, cy)
        canvas.drawCircle(0f, 0f, RADIUS, basePaint)
        canvas.drawCircle(0f, 0f, RADIUS, ringPaint)
        canvas.drawCircle(kx, ky, KNOB / 2, knobPaint)
        canvas.drawCircle(kx, ky, KNOB / 2, knobRing)
        canvas.restore()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val x = event.x - width / 2f
        val y = event.y - height / 2f
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                active = true
                ox = x; oy = y
                lastFlickY = y; flickT = System.currentTimeMillis()
                parent?.requestDisallowInterceptTouchEvent(true)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (!active) return true
                var dx = x - ox
                var dy = y - oy
                val d = hypot(dx, dy)
                if (d > RADIUS) { dx = dx / d * RADIUS; dy = dy / d * RADIUS }
                kx = dx; ky = dy
                // deadzone
                var ax = dx / RADIUS
                var ay = dy / RADIUS
                if (Math.abs(ax) < 0.12f) ax = 0f
                if (Math.abs(ay) < 0.12f) ay = 0f
                // upward flick = jump
                val now = System.currentTimeMillis()
                if (ay < -0.75f && lastFlickY - y > 70f && now - flickT < 260) {
                    onJumpFlick?.invoke()
                    flickT = 0
                }
                lastFlickY = y
                onMove?.invoke(ax, ay)
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                active = false
                kx = 0f; ky = 0f
                onMove?.invoke(0f, 0f)
                onRelease?.invoke()
                invalidate()
                return true
            }
        }
        return super.onTouchEvent(event)
    }
}
