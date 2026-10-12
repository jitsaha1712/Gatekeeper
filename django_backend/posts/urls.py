
from django.urls import path

from .views import (
    PostListCreateView,
    PostDetailView,
    PostReactionView,
    PostCommentListCreateView,
)


urlpatterns = [
    # List posts and create a new post.
    path(
        "posts/",
        PostListCreateView.as_view(),
        name="post-list-create",
    ),

    # View or delete a specific post.
    path(
        "posts/<int:pk>/",
        PostDetailView.as_view(),
        name="post-detail",
    ),

    # Add, change, or remove your reaction to a post.
    path(
        "posts/<int:post_id>/reaction/",
        PostReactionView.as_view(),
        name="post-reaction",
    ),

    # Read comments or add a comment to a post.
    path(
        "posts/<int:post_id>/comments/",
        PostCommentListCreateView.as_view(),
        name="post-comments",
    ),
]
