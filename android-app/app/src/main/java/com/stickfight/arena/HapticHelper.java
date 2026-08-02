package com.stickfight.arena;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

/**
 * Haptic feedback — patterns from the design doc:
 * light tap = your hit landed · buzz = you got hit · patterns for combo/KO.
 */
public final class HapticHelper {
    private HapticHelper() {}

    private static Vibrator v(Context c) {
        return (Vibrator) c.getSystemService(Context.VIBRATOR_SERVICE);
    }

    public static void tap(Context c) { vibrate(c, 8); }
    public static void buzz(Context c) { vibrate(c, 30); }
    public static void heavy(Context c) { vibrate(c, 60); }
    public static void round(Context c) { pattern(c, new long[] { 30, 60, 30 }); }
    public static void victory(Context c) { pattern(c, new long[] { 40, 50, 40, 50, 40, 120 }); }
    public static void combo(Context c, int n) {
        int len = Math.min(n, 8);
        long[] p = new long[len * 2];
        for (int i = 0; i < len; i++) { p[i * 2] = 15; p[i * 2 + 1] = (i % 2 == 0) ? 40 : 15; }
        pattern(c, p);
    }

    private static void vibrate(Context c, long ms) {
        Vibrator v = v(c);
        if (v == null || !v.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        else v.vibrate(ms);
    }

    private static void pattern(Context c, long[] p) {
        Vibrator v = v(c);
        if (v == null || !v.hasVibrator()) return;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(p, -1));
        else v.vibrate(p, -1);
    }
}
