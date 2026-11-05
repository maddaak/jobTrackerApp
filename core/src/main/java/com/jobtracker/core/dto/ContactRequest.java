package com.jobtracker.core.dto;

import com.jobtracker.core.model.Contact;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record ContactRequest(
        @NotBlank @Size(max = 100) String name,
        @NotNull Contact.ContactRole role,
        @Email @Size(max = 200) String email,
        // Shown as a link, so only a web address is taken.
        @Pattern(regexp = "^https?://\\S+$", message = "must be an http or https link") @Size(max = 500) String linkedInUrl,
        LocalDate lastContactedOn,
        @Size(max = 2000) String notes,
        LocalDate followUpOn) {

    public Contact toContact() {
        return new Contact(name.strip(), role, blankToNull(email), blankToNull(linkedInUrl), lastContactedOn,
                blankToNull(notes), followUpOn);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
