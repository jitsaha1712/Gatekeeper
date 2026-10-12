from django.contrib import admin

from .models import Post


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "content", "created_at")
    list_filter = ("created_at",)
    search_fields = ("content", "author__username")
    readonly_fields = ("created_at", "updated_at")