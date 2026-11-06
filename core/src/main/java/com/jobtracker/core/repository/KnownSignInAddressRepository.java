package com.jobtracker.core.repository;

import com.jobtracker.core.model.KnownSignInAddress;
import com.jobtracker.core.model.SignInSource;
import org.springframework.data.jpa.repository.JpaRepository;

public interface KnownSignInAddressRepository extends JpaRepository<KnownSignInAddress, SignInSource> {
}
