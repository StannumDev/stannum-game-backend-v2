const IS_PRODUCTION = process.env.NODE_ENV === "production";

const BASE_OPTIONS = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax",
  path: "/",
  ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN }),
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie("access_token", accessToken, {
    ...BASE_OPTIONS,
    maxAge: 5 * 60 * 1000,
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
