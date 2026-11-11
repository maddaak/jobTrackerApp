package com.jobtracker.core.security;

import com.jobtracker.core.config.PlaceholderSecrets;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

// First, so nothing behind it, the session check included, runs for a caller without the token.
@Component
@Order(1)
public class InternalTokenFilter extends OncePerRequestFilter {

    private final String internalToken;

    public InternalTokenFilter(@Value("${app.internal-token}") String internalToken) {
        // Fail fast: a blank token would let every request through, so refuse to start.
        if (internalToken == null || internalToken.isBlank()) {
            throw new IllegalStateException("app.internal-token must be configured and non-blank");
        }
        PlaceholderSecrets.refuse("INTERNAL_TOKEN", internalToken);
        this.internalToken = internalToken;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getRequestURI().equals("/health") || tokenMatches(request.getHeader("X-Internal-Token"))) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"missing or invalid internal token\"}");
    }

    // Constant-time compare so a caller cannot recover the token byte-by-byte via timing.
    private boolean tokenMatches(String provided) {
        // An empty header must never match.
        if (provided == null || provided.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(
                provided.getBytes(StandardCharsets.UTF_8), internalToken.getBytes(StandardCharsets.UTF_8));
    }
}
