(function () {
  const markup = `
    <div class="login-screen" id="loginScreen" style="display:none">
      <form class="login-card" id="loginForm">
        <h1 id="authTitle">Sign in to IMAS CS Tutor</h1>
        <p id="authSubtitle">Use your student account to continue.</p>
        <div id="displayNameField" hidden>
          <label for="loginDisplayName">Display name</label>
          <input id="loginDisplayName" autocomplete="name">
        </div>
        <label for="loginUsername">Username</label>
        <input id="loginUsername" autocomplete="username" required>
        <label for="loginPassword">Password</label>
        <input id="loginPassword" type="password" autocomplete="current-password" required>
        <button type="submit" id="loginButton">Sign in</button>
        <button class="auth-switch" type="button" id="authSwitchButton">Create an account</button>
        <p class="guest-note" id="guestNote">You can try three questions before creating an account.</p>
        <p class="login-error" id="loginError" role="alert"></p>
      </form>
    </div>`;
  document.body.insertAdjacentHTML("afterbegin", markup);
})();
