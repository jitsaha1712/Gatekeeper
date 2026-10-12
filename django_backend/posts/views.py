
from django.shortcuts import get_object_or_404

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Post, PostReaction
from .serializers import (
    PostCommentSerializer,
    PostSerializer,
    ReactionInputSerializer,
)


class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Allow users to delete their own posts.
    Allow staff and superusers to delete any post.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        return (
            obj.author_id == request.user.id
            or request.user.is_staff
            or request.user.is_superuser
        )


class PostListCreateView(generics.ListCreateAPIView):
    # Anyone may view posts; only logged-in users may create posts.
    queryset = Post.objects.select_related("author").all()
    serializer_class = PostSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class PostDetailView(generics.RetrieveDestroyAPIView):
    # Only the post owner or an administrator may delete a post.
    queryset = Post.objects.select_related("author").all()
    serializer_class = PostSerializer
    permission_classes = [
        permissions.IsAuthenticatedOrReadOnly,
        IsOwnerOrAdmin,
    ]


class PostReactionView(APIView):
    # Only logged-in users may react to posts.
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, post_id):
        post = get_object_or_404(Post, pk=post_id)

        serializer = ReactionInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reaction, created = PostReaction.objects.update_or_create(
            post=post,
            user=request.user,
            defaults={
                "reaction": serializer.validated_data["reaction"],
            },
        )

        return Response(
            {
                "post_id": post.id,
                "reaction": reaction.reaction,
                "message": (
                    "Reaction added."
                    if created
                    else "Reaction updated."
                ),
            },
            status=(
                status.HTTP_201_CREATED
                if created
                else status.HTTP_200_OK
            ),
        )

    def delete(self, request, post_id):
        post = get_object_or_404(Post, pk=post_id)

        PostReaction.objects.filter(
            post=post,
            user=request.user,
        ).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class PostCommentListCreateView(generics.ListCreateAPIView):
    # Anyone may read comments; only logged-in users may comment.
    serializer_class = PostCommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get_post(self):
        return get_object_or_404(
            Post,
            pk=self.kwargs["post_id"],
        )

    def get_queryset(self):
        return (
            self.get_post()
            .comments
            .select_related("author")
            .all()
        )

    def perform_create(self, serializer):
        serializer.save(
            post=self.get_post(),
            author=self.request.user,
        )
