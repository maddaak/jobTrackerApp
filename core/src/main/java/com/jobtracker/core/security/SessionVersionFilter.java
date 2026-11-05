package com.jobtracker.core.security;

import com.jobtracker.core.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.Optional;

// The bff passes on the session version its token was signed with. One behind the account's, because the
// password changed since or "sign out other devices" was used, is refused, and the browser signs in again.
// No header means a call that isn't a signed-in session's, such as the password-reset script's.
@Component
@Order(2)
public class SessionVersionFilter extends OncePerRequestFilter {

    private final UserRepository users;

    public SessionVersionFilter(UserRepository users) {
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String userId = request.getHeader("X-User-Id");
        String version = request.getHeader("X-Session-Version");
        if (userId == null || version == null || current(userId, version)) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"this session was signed out; sign in again\"}");
    }

    private boolean current(String userId, String version) {
        try {
            Optional<Integer> latest = users.findSessionVersionById(Long.parseLong(userId));
            return latest.isPresent() && latest.get() == Integer.parseInt(version);
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
