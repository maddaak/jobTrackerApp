package com.jobtracker.core.controller;

import com.jobtracker.core.dto.AuthResponse;
import com.jobtracker.core.dto.LoginRequest;
import com.jobtracker.core.dto.RegisterRequest;
import com.jobtracker.core.dto.ResetPasswordRequest;
import com.jobtracker.core.dto.UsernameRequest;
import com.jobtracker.core.service.AuthService;
import com.jobtracker.core.service.PasswordResetService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResets;

    public AuthController(AuthService authService, PasswordResetService passwordResets) {
        this.authService = authService;
        this.passwordResets = passwordResets;
    }

    // Asked by the register page so it can say registration is closed before anyone fills the form in.
    @GetMapping("/registration")
    public Map<String, Boolean> registration() {
        return Map.of("open", authService.canRegister());
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    // The bff passes on the visitor's address; a direct call without it counts with every unknown address.
    public AuthResponse login(@Valid @RequestBody LoginRequest request,
            @RequestHeader(value = "X-Client-Address", defaultValue = "") String address) {
        return authService.login(request, address);
    }

    // Always 202, whether or not anything was sent.
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgotPassword(@Valid @RequestBody UsernameRequest request) {
        passwordResets.requestResetLink(request.username());
    }

    @PostMapping("/reset-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResets.resetWithToken(request.token(), request.newPassword());
    }

    // For the terminal reset only. The bff has no route to it, so a browser can never reach it; the script
    // runs inside the bff container, where the internal token is.
    @PostMapping("/temporary-password")
    public ResponseEntity<Map<String, String>> temporaryPassword(@Valid @RequestBody UsernameRequest request) {
        return passwordResets.temporaryPassword(request.username())
                .map(password -> ResponseEntity.ok(Map.of("temporaryPassword", password)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "no account named " + request.username())));
    }
}
