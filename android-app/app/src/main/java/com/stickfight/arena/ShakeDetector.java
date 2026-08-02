package com.stickfight.arena;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

/**
 * Shake detection → Rage Mode (like the web controller's devicemotion handler).
 */
public class ShakeDetector implements SensorEventListener {
    public interface Listener { void onShake(); }

    private final SensorManager sm;
    private final Sensor accel;
    private final Listener listener;
    private float lastMag = 0;
    private long cooldownUntil = 0;
    private boolean attached = false;

    public ShakeDetector(Context ctx, Listener l) {
        sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        accel = sm != null ? sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) : null;
        listener = l;
    }

    public void attach() {
        if (accel != null && !attached) {
            sm.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME);
            attached = true;
        }
    }
    public void detach() {
        if (attached) {
            sm.unregisterListener(this);
            attached = false;
        }
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        float mag = Math.abs(e.values[0]) + Math.abs(e.values[1]) + Math.abs(e.values[2]);
        long now = System.currentTimeMillis();
        if (mag - lastMag > 22f && now > cooldownUntil) {
            cooldownUntil = now + 4000; // 4s cooldown
            if (listener != null) listener.onShake();
        }
        lastMag = mag;
    }

    @Override
    public void onAccuracyChanged(Sensor s, int a) {}
}
