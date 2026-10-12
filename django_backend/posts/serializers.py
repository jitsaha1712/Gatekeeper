
from rest_framework import serializers

from .models import Post, PostReaction, PostComment


class PostCommentSerializer(serializers.ModelSerializer):
    author = serializers.CharField(
        source="author.username",
        read_only=True,
    )

    class Meta:
        model = PostComment
        fields = [
            "id",
            "author",
            "content",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "author",
            "created_at",
            "updated_at",
        ]


class ReactionInputSerializer(serializers.Serializer):
    reaction = serializers.ChoiceField(
        choices=PostReaction.ReactionType.choices,
    )


class PostSerializer(serializers.ModelSerializer):
    author = serializers.CharField(
        source="author.username",
        read_only=True,
    )

    comments = PostCommentSerializer(
        many=True,
        read_only=True,
    )

    reaction_counts = serializers.SerializerMethodField()
    my_reaction = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = [
            "id",
            "author",
            "content",
            "created_at",
            "updated_at",
            "reaction_counts",
            "my_reaction",
            "comments",
        ]
        read_only_fields = [
            "id",
            "author",
            "created_at",
            "updated_at",
            "reaction_counts",
            "my_reaction",
            "comments",
        ]

    def get_reaction_counts(self, obj):
        counts = {
            value: 0
            for value, _label in PostReaction.ReactionType.choices
        }

        for reaction in obj.reactions.all():
            counts[reaction.reaction] += 1

        return counts

    def get_my_reaction(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if not user or not user.is_authenticated:
            return None

        for reaction in obj.reactions.all():
            if reaction.user_id == user.pk:
                return reaction.reaction

        return None
