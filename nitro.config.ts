export default {
  routeRules: {
    "/**": {
      headers: {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none';",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    },
  },
};
