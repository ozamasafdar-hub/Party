import { defineStore } from 'pinia'
import { listFollowing, listFollowers, follow, unfollow } from '@/services/eventService'

/**
 * Who the signed-in member follows. Friends' events get highlighted on
 * the map and cards show "N friends going".
 */
export const useFollowStore = defineStore('follows', {
  state: () => ({
    followingIds: [],
    loadedFor: null
  }),

  getters: {
    isFollowing: (state) => (memberId) => state.followingIds.includes(memberId),

    /** Friends attending or hosting (excludes yourself). */
    friendsIn() {
      return (event) =>
        event.attendeeIds.filter((id) => this.followingIds.includes(id))
    },

    isFriendEvent() {
      return (event) =>
        this.followingIds.includes(event.hostId) || this.friendsIn(event).length > 0
    }
  },

  actions: {
    async load(userId) {
      if (!userId || this.loadedFor === userId) return
      this.loadedFor = userId
      this.followingIds = await listFollowing(userId)
    },

    async toggle(userId, memberId) {
      this.followingIds = this.isFollowing(memberId)
        ? await unfollow(userId, memberId)
        : await follow(userId, memberId)
    },

    /** Social graph for any member's profile (not just mine). */
    async graphFor(memberId) {
      const [following, followers] = await Promise.all([
        listFollowing(memberId),
        listFollowers(memberId)
      ])
      return { following, followers }
    },

    reset() {
      this.followingIds = []
      this.loadedFor = null
    }
  }
})
