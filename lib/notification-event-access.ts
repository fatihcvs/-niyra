import { communityEventVisibleSql } from "./community-event-access";
import { APP_ACCOUNT_ACCESS_SQL } from "./app-auth";

/** Trusted aliases only. Filter private event notifications before ordering/limiting the inbox. */
export const NOTIFICATION_EVENT_VISIBLE_SQL = `(n.entity_type IS NULL OR n.entity_type NOT IN ('community-event','community_event') OR (
  notification_viewer.onboarding_completed=1
  AND EXISTS(SELECT 1 FROM community_events notification_event WHERE notification_event.id=n.entity_id
    AND ${communityEventVisibleSql("notification_event", "notification_viewer.email", "notification_viewer.university_id")})
  AND (n.actor_email IS NULL OR EXISTS(SELECT 1 FROM users notification_actor
    JOIN student_profiles notification_actor_profile ON notification_actor_profile.user_email=notification_actor.email
    WHERE notification_actor.email=n.actor_email AND notification_actor.status='active'
      AND notification_actor_profile.onboarding_completed=1
      AND notification_actor_profile.university_id=notification_viewer.university_id
      AND NOT EXISTS(SELECT 1 FROM user_blocks notification_actor_block
        WHERE (notification_actor_block.blocker_email=notification_viewer.email AND notification_actor_block.blocked_email=n.actor_email)
          OR (notification_actor_block.blocker_email=n.actor_email AND notification_actor_block.blocked_email=notification_viewer.email))))))`;

/** Bind the same account generation, campus and onboarding state throughout the response. */
export const NOTIFICATION_VIEWER_SQL = `WITH notification_viewer AS (
  SELECT notification_user.email,notification_profile.university_id,
    COALESCE(notification_profile.onboarding_completed,0) AS onboarding_completed
  FROM users notification_user LEFT JOIN student_profiles notification_profile ON notification_profile.user_email=notification_user.email
  WHERE notification_user.email=? AND notification_user.public_id=? AND notification_user.status='active'
    AND notification_profile.university_id IS ? AND COALESCE(notification_profile.onboarding_completed,0)=?
    AND ${APP_ACCOUNT_ACCESS_SQL.replace(/\bu\./g, "notification_user.")})`;
