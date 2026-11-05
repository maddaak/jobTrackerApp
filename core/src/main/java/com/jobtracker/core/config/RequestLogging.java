package com.jobtracker.core.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

// One line per request that failed on the server or ran slow, so `docker compose logs core` says which call
// broke instead of only a generic 500 reaching the browser. Method, path, status, and time: no bodies.
@Component
public class RequestLogging extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLogging.class);
    static final long SLOW_MS = 2000;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long millis = (System.nanoTime() - start) / 1_000_000;
            int status = response.getStatus();
            if (status >= 500) {
                log.warn("{} {} -> {} in {} ms", request.getMethod(), request.getRequestURI(), status, millis);
            } else if (millis >= SLOW_MS) {
                log.warn("{} {} -> {} took {} ms", request.getMethod(), request.getRequestURI(), status, millis);
            } else if (log.isDebugEnabled()) {
                log.debug("{} {} -> {} in {} ms", request.getMethod(), request.getRequestURI(), status, millis);
            }
        }
    }
}
