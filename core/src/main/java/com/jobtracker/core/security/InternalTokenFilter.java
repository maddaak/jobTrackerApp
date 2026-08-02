package com.jobtracker.core.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InternalTokenFilter extends OncePerRequestFilter {

    private final String internalToken;

    public InternalTokenFilter(@Value("${app.internal-token}") String internalToken) {
        // Fail fast: a blank internal token would let every request through, so refuse to start
        // rather than silently running with authentication disabled.
        if (internalToken == null || internalToken.isBlank()) {
            throw new IllegalStateException("app.internal-token must be configured and non-blank");
        }
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
        // Reject a blank or empty provided token outright so an empty header can never match.
        if (provided == null || provided.isBlank()) {
            return false;
        }
        return MessageDigest.isEqual(
                provided.getBytes(StandardCharsets.UTF_8), internalToken.getBytes(StandardCharsets.UTF_8));
    }
}
