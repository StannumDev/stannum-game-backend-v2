const ms = require("ms");

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "lax";
// SameSite=None exige Secure (spec). Forzamos secure también en ese caso.
const COOKIE_SECURE = IS_PRODUCTION || process.env.FORCE_SECURE_COOKIES === "true" || COOKIE_SAMESITE === "none";
// maxAge de la cookie access_token alineado con el TTL del JWT (ACCESS_TOKEN_EXPIRY) —
// única fuente de verdad para que no se desincronicen (antes: cookie 5m vs JWT 15m).
const ACCESS_TOKEN_COOKIE_MAX_AGE = ms(process.env.ACCESS_TOKEN_EXPIRY || "15m");

const BASE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: COOKIE_SAMESITE,
  path: "/",
  ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie("access_token", accessToken, {
    ...BASE_OPTIONS,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
  });
  res.cookie("refresh_token", refreshToken, {
    ...BASE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.cookie("logged_in", "1", {
    ...BASE_OPTIONS,
    httpOnly: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookies = (res) => {
  const clearOptions = {
    path: "/",
    ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
  };
  res.clearCookie("access_token", clearOptions);
  res.clearCookie("refresh_token", clearOptions);
  res.clearCookie("logged_in", clearOptions);
};

module.exports = { setAuthCookies, clearAuthCookies };
