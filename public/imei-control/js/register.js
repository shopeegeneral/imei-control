const registerForm = document.getElementById('register-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const fullNameInput = document.getElementById('full-name');
const roleSelect = document.getElementById('role');
const registerBtn = document.getElementById('register-btn');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'flex';
  successMessage.style.display = 'none';
}

function showSuccess(message) {
  successMessage.textContent = message;
  successMessage.style.display = 'flex';
  errorMessage.style.display = 'none';
}

function hideMessages() {
  errorMessage.style.display = 'none';
  successMessage.style.display = 'none';
}

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessages();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const fullName = fullNameInput.value.trim();
  const role = roleSelect.value;

  // Validate
  if (!email || !password || !confirmPassword || !fullName || !role) {
    showError('Vui lòng nhập đầy đủ các thông tin bắt buộc');
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showError('Email không hợp lệ');
    emailInput.focus();
    return;
  }

  if (password.length < 6) {
    showError('Mật khẩu phải có ít nhất 6 ký tự');
    passwordInput.focus();
    return;
  }

  if (password !== confirmPassword) {
    showError('Mật khẩu xác nhận không khớp');
    confirmPasswordInput.focus();
    return;
  }

  // Disable button
  registerBtn.disabled = true;
  registerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng ký...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName,
        role
      })
    });

    const data = await res.json();

    if (res.ok) {
      showSuccess(`Tạo tài khoản thành công cho ${data.user.email}!`);
      registerForm.reset();
      emailInput.focus();
      
      // Re-enable button after success
      setTimeout(() => {
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Tạo tài khoản';
      }, 2000);
    } else {
      showError(data.error || 'Đăng ký thất bại');
      registerBtn.disabled = false;
      registerBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Đăng ký';
    }
  } catch (err) {
    console.error('Register error:', err);
    showError('Lỗi kết nối server');
    registerBtn.disabled = false;
    registerBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Đăng ký';
  }
});

// Focus on email when page loads
emailInput.focus();
