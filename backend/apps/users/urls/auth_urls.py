from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from apps.users import views

urlpatterns = [
    path('register/',       views.RegisterView.as_view(),       name='auth-register'),
    path('login/',          views.LoginView.as_view(),           name='auth-login'),
    path('token/refresh/',  TokenRefreshView.as_view(),          name='auth-token-refresh'),
    path('logout/',         TokenBlacklistView.as_view(),        name='auth-logout'),
    path('forgot-password/',views.ForgotPasswordView.as_view(),  name='auth-forgot-pw'),
    path('verify-otp/',     views.VerifyOTPView.as_view(),       name='auth-verify-otp'),
    path('reset-password/', views.ResetPasswordView.as_view(),   name='auth-reset-pw'),
]
