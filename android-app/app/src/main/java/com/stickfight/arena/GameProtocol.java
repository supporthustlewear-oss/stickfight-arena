package com.stickfight.arena;

/**
 * StickFight Arena — game protocol constants (shared with the Node server).
 * Pure Java: characters, action names, code normalization.
 */
public final class GameProtocol {
    private GameProtocol() {}

    public static final String[] CHARS = { "shadow", "blaze", "volt", "titan", "viper", "frost", "ghost", "storm" };
    public static final String[] CHAR_NAMES = { "SHADOW", "BLAZE", "VOLT", "TITAN", "VIPER", "FROST", "GHOST", "STORM" };
    public static final String[] CHAR_EMOJI = { "🖤", "🔥", "⚡", "💪", "🐍", "❄️", "👻", "🌪️" };
    public static final String[] CHAR_STYLES = { "Ninja", "Brawler", "Speedster", "Tank", "Martial", "Ice", "Phantom", "Air" };
    public static final String[] CHAR_COLORS = { "#8a5cff", "#ff5a2d", "#ffe14d", "#6b7a8f", "#3ddc67", "#4dc9ff", "#9ae6e0", "#7fd4ff" };

    // controller -> server actions
    public static final String ACT_JUMP = "jump";
    public static final String ACT_DODGE = "dodge";
    public static final String ACT_DASH = "dash";
    public static final String ACT_SLIDE = "slide";
    public static final String ACT_SPIN = "spin";
    public static final String ACT_TAUNT = "taunt";
    public static final String ACT_RAGE = "rage";
    public static final String ACT_LIGHT = "A";
    public static final String ACT_KICK = "B";
    public static final String ACT_HEAVY = "X";
    public static final String ACT_SPECIAL = "Y";
    public static final String ACT_ULT = "ult";
    public static final String ACT_GRAB = "grab";
    public static final String ACT_BLOCK_ON = "blockOn";
    public static final String ACT_BLOCK_OFF = "blockOff";
    public static final String ACT_RB_ON = "RB";
    public static final String ACT_RB_OFF = "releaseRB";

    /** normalize a room code: uppercase, strip non-alphanumerics (server compares normalized) */
    public static String normCode(String c) {
        if (c == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char ch : c.toUpperCase().toCharArray()) {
            if (Character.isLetterOrDigit(ch)) sb.append(ch);
        }
        return sb.toString();
    }

    /** extract a room code from scanned QR text (deep link or plain code) */
    public static String codeFromQr(String data) {
        if (data == null) return null;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("[?&]room=([A-Za-z0-9-]+)").matcher(data);
        if (m.find()) return m.group(1).toUpperCase();
        m = java.util.regex.Pattern.compile("([A-Z]{3}-\\d{3})").matcher(data);
        return m.find() ? m.group(1).toUpperCase() : null;
    }
}
