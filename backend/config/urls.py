"""URL configuration for config project."""

from django.urls import path

from trips import views

urlpatterns = [
    path("api/places", views.places),
    path("api/plan", views.plan),
]
