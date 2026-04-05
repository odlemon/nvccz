// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { emitToUser } from "../services/RealtimeSocketService";
import { mergeTaskNotificationData } from "../utils/taskNotificationDeepLink";
import { PerformanceConfigService } from "../services/PerformanceConfigService";

// Helper function to get relative time
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else {
    const months = Math.floor(diffInSeconds / 2592000);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
}

export const homepageController = {
  // Get all homepage data
  async getHomepageData(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      
      // Parse pagination parameters
      const {
        limit = 20,
        cursor,
        postsLimit = 10,
        newslettersLimit = 5,
        eventsLimit = 10
      } = req.query;

      // Validate pagination parameters
      const parsedLimit = Math.min(Math.max(Number(limit), 1), 100);
      const parsedPostsLimit = Math.min(Math.max(Number(postsLimit), 1), 50);
      const parsedNewslettersLimit = Math.min(Math.max(Number(newslettersLimit), 1), 20);
      const parsedEventsLimit = Math.min(Math.max(Number(eventsLimit), 1), 50);

      // Parse cursor if provided
      let cursorDate: Date | undefined;
      if (cursor && typeof cursor === 'string') {
        try {
          const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
          cursorDate = new Date(decodedCursor);
          if (isNaN(cursorDate.getTime())) {
            return res.status(400).json({
              success: false,
              message: "Invalid cursor format"
            });
          }
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Invalid cursor format"
          });
        }
      }

      // Update user's last seen
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() }
      });

      // Build cursor filter for posts
      const postsCursorFilter = cursorDate ? {
        createdAt: { lt: cursorDate }
      } : {};

      // Get all data in parallel for better performance
      const [
        posts,
        newsletters,
        upcomingEvents,
        allEvents,
        onlineUsers,
        strategicAlignment
      ] = await Promise.all([
        // Get active posts (not expired) with pagination
        prisma.post.findMany({
          where: {
            isActive: true,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ],
            ...postsCursorFilter
          },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            replies: {
              include: {
                author: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true
                  }
                }
              },
              orderBy: { createdAt: 'asc' }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: parsedPostsLimit
        }),

        // Get active newsletters with pagination
        prisma.newsletter.findMany({
          where: { isActive: true },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: parsedNewslettersLimit
        }),

        // Get upcoming events (start date >= current date) with pagination
        prisma.event.findMany({
          where: {
            isActive: true,
            startDate: { gte: new Date() }
          },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { startDate: 'asc' },
          take: parsedEventsLimit
        }),

        // Get all active events (regardless of date) with pagination
        prisma.event.findMany({
          where: { isActive: true },
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { startDate: 'asc' },
          take: parsedEventsLimit
        }),

        // Get online users (active in last 5 minutes)
        prisma.user.findMany({
          where: {
            lastSeen: {
              gte: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
            }
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            lastSeen: true
          },
          orderBy: { lastSeen: 'desc' }
        }),

        PerformanceConfigService.getPillarConfig().catch(() => ({
          strategyId: null,
          strategyTitle: null,
          periodStart: null,
          periodEnd: null,
          visionStatement: null,
          pillars: [],
          strategyDocumentUrl: null
        }))
      ]);

      // Calculate summary statistics
      const summary = {
        totalPosts: posts.length,
        totalNewsletters: newsletters.length,
        upcomingEvents: upcomingEvents.length,
        totalEvents: allEvents.length,
        onlineUsers: onlineUsers.length
      };

      // Generate next cursor if there are posts
      let nextCursor: string | null = null;
      if (posts.length > 0 && posts.length === parsedPostsLimit) {
        const lastPost = posts[posts.length - 1];
        nextCursor = Buffer.from(lastPost.createdAt.toISOString()).toString('base64');
      }

      res.status(200).json({
        success: true,
        data: {
          posts,
          newsletters,
          events: {
            upcoming: upcomingEvents,
            all: allEvents
          },
          onlineUsers,
          strategicAlignment: {
            visionStatement: strategicAlignment.visionStatement,
            strategyId: strategicAlignment.strategyId,
            strategyTitle: strategicAlignment.strategyTitle,
            periodStart: strategicAlignment.periodStart,
            periodEnd: strategicAlignment.periodEnd,
            pillars: strategicAlignment.pillars,
            strategyDocumentUrl: strategicAlignment.strategyDocumentUrl
          },
          summary,
          pagination: {
            hasMore: nextCursor !== null,
            nextCursor,
            limit: parsedPostsLimit,
            postsLimit: parsedPostsLimit,
            newslettersLimit: parsedNewslettersLimit,
            eventsLimit: parsedEventsLimit
          }
        }
      });
    } catch (error: any) {
      console.error("Error fetching homepage data:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get online activity (for the online activity widget)
  async getOnlineActivity(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;

      // Update user's last seen
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() }
      });

      // Get all users with their last seen time
      const users = await prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          lastSeen: true
        },
        orderBy: { lastSeen: 'desc' }
      });

      // Add online status (active in last 5 minutes)
      const usersWithStatus = users.map(user => ({
        ...user,
        isOnline: user.lastSeen >= new Date(Date.now() - 5 * 60 * 1000)
      }));

      res.status(200).json({
        success: true,
        data: usersWithStatus
      });
    } catch (error: any) {
      console.error("Error fetching online activity:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get user's notifications
  async getUserNotifications(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;

      console.log(`🔍 Fetching notifications for user: ${userId}`);

      // Get notifications with pagination
      const notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset)
      });

      console.log(`📊 Found ${notifications.length} notifications for user ${userId}`);

      // Get total count for pagination
      const totalCount = await prisma.notification.count({
        where: { userId }
      });

      // Get unread count
      const unreadCount = await prisma.notification.count({
        where: {
          userId,
          isRead: false
        }
      });

      console.log(`📈 Total notifications: ${totalCount}, Unread: ${unreadCount}`);

      // Format notifications with better structure
      const formattedNotifications = notifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        data: mergeTaskNotificationData(
          notification.type,
          notification.data,
          notification.relatedEntity,
          notification.relatedEntityId
        ),
        relatedEntity: notification.relatedEntity,
        relatedEntityId: notification.relatedEntityId,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
        timeAgo: getTimeAgo(notification.createdAt)
      }));

      res.status(200).json({
        success: true,
        data: {
          notifications: formattedNotifications,
          pagination: {
            total: totalCount,
            unread: unreadCount,
            limit: Number(limit),
            offset: Number(offset),
            hasMore: Number(offset) + Number(limit) < totalCount
          }
        }
      });
    } catch (error: any) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Mark notification as read
  async markNotificationAsRead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const notification = await prisma.notification.findFirst({
        where: {
          id,
          userId
        }
      });

      if (!notification) {
        res.status(404).json({
          success: false,
          message: "Notification not found"
        });
        return;
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true }
      });

      const unread = await prisma.notification.count({
        where: { userId, isRead: false }
      });
      emitToUser(userId, "notification_read", { id });
      emitToUser(userId, "notification_unread_count", { unread });

      res.status(200).json({
        success: true,
        message: "Notification marked as read",
        unread
      });
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Mark all notifications as read
  async markAllNotificationsAsRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;

      await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false
        },
        data: { isRead: true }
      });

      emitToUser(userId, "notification_read_all", { success: true });
      emitToUser(userId, "notification_unread_count", { unread: 0 });

      res.status(200).json({
        success: true,
        message: "All notifications marked as read",
        unread: 0
      });
    } catch (error: any) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Debug endpoint to check all notifications (admin only)
  async getAllNotificationsDebug(req: AuthRequest, res: Response) {
    try {
      // Check if user is admin
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { role: true }
      });

      if (!user || user.role.name !== 'admin') {
        res.status(403).json({
          success: false,
          message: "Access denied. Admin only."
        });
        return;
      }

      const allNotifications = await prisma.notification.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const totalCount = await prisma.notification.count();
      const unreadCount = await prisma.notification.count({
        where: { isRead: false }
      });

      res.status(200).json({
        success: true,
        data: {
          notifications: allNotifications,
          summary: {
            total: totalCount,
            unread: unreadCount
          }
        }
      });
    } catch (error: any) {
      console.error("Error fetching all notifications:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}; 