package com.stickfight.arena;

import android.media.AudioManager;
import android.media.ToneGenerator;

/**
 * Native button/feedback sounds (no audio files needed) —
 * complements the haptics: taps, buzzes, KO and victory jingles.
 */
public final class SoundHelper {
    private static ToneGenerator tg;

    private SoundHelper() {}

    public static void init() {
        if (tg == null) {
            try {
                tg = new ToneGenerator(AudioManager.STREAM_MUSIC, 35);
            } catch (Exception e) {
                tg = null;
            }
        }
    }

    public static void tap() { beep(ToneGenerator.TONE_PROP_BEEP2, 25); }
    public static void buzz() { beep(ToneGenerator.TONE_PROP_BEEP, 55); }
    public static void ko() { beep(ToneGenerator.TONE_SUP_ERROR, 320); }
    public static void victory() {
        final int[] seq = { ToneGenerator.TONE_PROP_BEEP2, ToneGenerator.TONE_PROP_BEEP2, ToneGenerator.TONE_PROP_ACK };
        new Thread(() -> {
            for (int t : seq) {
                beep(t, 60);
                try { Thread.sleep(95); } catch (InterruptedException ignored) {}
            }
        }).start();
    }

    private static void beep(int tone, int ms) {
        if (tg != null) {
            try { tg.startTone(tone, ms); } catch (Exception ignored) {}
        }
    }
}
