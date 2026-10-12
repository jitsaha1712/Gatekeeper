
import os
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Post, PostComment, PostReaction


class PostPermissionTests(TestCase):
    def setUp(self):
        self.env_patch = patch.dict(
            os.environ,
            {"GATEKEEPER_INTERNAL_KEY": "test-internal-key"},
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

        self.client = APIClient()
        self.client.credentials(
            HTTP_X_GATEKEEPER_INTERNAL_KEY="test-internal-key"
        )

        User = get_user_model()

        self.owner = User.objects.create_user(
            username="owner",
            password="test-password-123",
        )
        self.other_user = User.objects.create_user(
            username="otheruser",
            password="test-password-123",
        )
        self.admin = User.objects.create_user(
            username="admin",
            password="test-password-123",
            is_staff=True,
        )

        self.post = Post.objects.create(
            author=self.owner,
            content="This is a test post.",
        )

    def test_public_feed_is_available(self):
        response = self.client.get("/api/posts/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_user_can_create_post(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            "/api/posts/",
            {"content": "A new automated test post."},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["author"], "owner")

    def test_owner_can_delete_own_post(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.delete(
            f"/api/posts/{self.post.id}/"
        )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(
            Post.objects.filter(id=self.post.id).exists()
        )

    def test_user_cannot_delete_another_users_post(self):
        self.client.force_authenticate(user=self.other_user)

        response = self.client.delete(
            f"/api/posts/{self.post.id}/"
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            Post.objects.filter(id=self.post.id).exists()
        )

    def test_admin_can_delete_another_users_post(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.delete(
            f"/api/posts/{self.post.id}/"
        )

        self.assertEqual(response.status_code, 204)

    def test_direct_api_request_without_internal_key_is_blocked(self):
        direct_client = APIClient()

        response = direct_client.get("/api/posts/")

        self.assertEqual(response.status_code, 403)

    def test_user_can_add_change_and_remove_reaction(self):
        self.client.force_authenticate(user=self.other_user)
        url = f"/api/posts/{self.post.id}/reaction/"

        # Add a reaction.
        response = self.client.post(
            url,
            {"reaction": "like"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)

        # Change the same user's reaction.
        response = self.client.post(
            url,
            {"reaction": "love"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        reactions = PostReaction.objects.filter(
            post=self.post,
            user=self.other_user,
        )
        self.assertEqual(reactions.count(), 1)
        self.assertEqual(reactions.get().reaction, "love")

        # Remove the reaction.
        response = self.client.delete(url)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(reactions.exists())

    def test_anonymous_user_cannot_react(self):
        response = self.client.post(
            f"/api/posts/{self.post.id}/reaction/",
            {"reaction": "like"},
            format="json",
        )

        self.assertIn(response.status_code, [401, 403])
        self.assertFalse(PostReaction.objects.exists())

    def test_comment_uses_authenticated_user_as_author(self):
        self.client.force_authenticate(user=self.other_user)

        response = self.client.post(
            f"/api/posts/{self.post.id}/comments/",
            {
                "content": "Great post!",
                "author": "owner",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["author"], "otheruser")

        comment = PostComment.objects.get()
        self.assertEqual(comment.author, self.other_user)
        self.assertEqual(comment.post, self.post)

    def test_comments_are_readable_without_login(self):
        response = self.client.get(
            f"/api/posts/{self.post.id}/comments/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])
