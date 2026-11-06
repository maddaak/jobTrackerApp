package com.jobtracker.core.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// currentPassword is needed only when the email changes, since reset links go there.
public record UpdateAccountRequest(
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Email @Size(max = 254) String email,
        @Size(max = 200) String currentPassword) {
}
