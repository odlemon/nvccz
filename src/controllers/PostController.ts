// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

/**
 * `category`/`isSolved` were added to `posts` by a raw-SQL migration (this worktree's Prisma
 * client is generated from the pre-migration schema and can't be regenerated here — junctioned
 * node_modules shared with the main checkout — so the typed client silently omits these two
 * columns from every query). Patched in via a small side query rather than touching the rest of
 * this controller's relation-heavy Prisma calls.
 */
async function attachPostExtras<T extends { id: string }>(posts: T[]): Promise<(T & { category: string | null; isSolved: boolean })[]> {
  if (posts.length === 0) return posts as (T & { category: string | null; isSolved: boolean })[];
  const ids = posts.map((p) => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; category: string | null; isSolved: number | boolean }>>(
    `SELECT id, category, isSolved FROM posts WHERE id IN (${placeholders})`,
    ...ids
  );
  const byId = new Map(rows.map((r) => [r.id, { category: r.category, isSolved: Boolean(r.isSolved) }]));
  return posts.map((p) => ({ ...p, ...(byId.get(p.id) || { category: null, isSolved: false }) }));
}

export const postController = {
  // Create a new post
  async createPost(req: AuthRequest, res: Response) {
    try {
      const { title, content, expiresAt, isNotified, category } = req.body;
      const authorId = req.user.id;

      // Update user's last seen
      await prisma.user.update({
        where: { id: authorId },
        data: { lastSeen: new Date() }
      });

      // Validation
      if (!title || !content) {
        res.status(400).json({
          success: false,
          message: "Title and content are required"
        });
        return;
      }

      if (title.length > 200) {
        res.status(400).json({
          success: false,
          message: "Title must be less than 200 characters"
        });
        return;
      }

      // Create post
      const post = await prisma.post.create({
        data: {
          title,
          content,
          authorId,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          isNotified: isNotified || false
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
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      const normalizedCategory = category ? String(category).trim().slice(0, 64) : null;
      if (normalizedCategory) {
        await prisma.$executeRawUnsafe(`UPDATE posts SET category = ? WHERE id = ?`, normalizedCategory, post.id);
      }
      (post as any).category = normalizedCategory;
      (post as any).isSolved = false;

      // Create notification for all users if isNotified is true
      if (isNotified) {
        try {
          // Get ALL users (including the author)
          const allUsers = await prisma.user.findMany();

          if (allUsers.length > 0) {
            const notifications = allUsers.map(user => ({
              title: `New Company Post: ${title}`,
              message: `A new post has been created by ${req.user.firstName} ${req.user.lastName}`,
              type: 'post',
              userId: user.id,
              data: {
                postId: post.id,
                authorId: authorId,
                authorName: `${req.user.firstName} ${req.user.lastName}`
              }
            }));

            const createdNotifications = await prisma.notification.createMany({
              data: notifications
            });

            console.log(`✅ Created ${createdNotifications.count} notifications for post: ${post.id}`);
          } else {
            console.log('⚠️ No users found to notify');
          }
        } catch (notificationError) {
          console.error('❌ Error creating notifications:', notificationError);
          // Don't fail the post creation if notification fails
        }
      }

      // Log activity
      await prisma.userActivity.create({
        data: {
          userId: authorId,
          action: 'post_created',
          details: {
            postId: post.id,
            title: title
          }
        }
      });

      res.status(201).json({
        success: true,
        message: "Post created successfully",
        data: post
      });
    } catch (error: any) {
      console.error("Error creating post:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get all posts
  async getAllPosts(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;

      // Update user's last seen
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() }
      });

      const posts = await prisma.post.findMany({
        where: {
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
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
            orderBy: {
              createdAt: 'asc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.status(200).json({
        success: true,
        data: await attachPostExtras(posts)
      });
    } catch (error: any) {
      console.error("Error fetching posts:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get post by ID
  async getPostById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const post = await prisma.post.findUnique({
        where: { id },
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
                      lastName: true,
                      email: true
                    }
                  }
                },
                orderBy: {
                  createdAt: 'asc'
                }
              }
            },
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Post not found"
        });
        return;
      }

      const [postWithExtras] = await attachPostExtras([post]);
      Object.assign(post, { category: postWithExtras.category, isSolved: postWithExtras.isSolved });

      // Function to enhance reply with nested replies
      const enhanceReply = (reply: any) => ({
        ...reply,
        author: {
          ...reply.author,
          fullName: `${reply.author.firstName} ${reply.author.lastName}`
        },
        replies: reply.replies.map((nestedReply: any) => ({
          ...nestedReply,
          author: {
            ...nestedReply.author,
            fullName: `${nestedReply.author.firstName} ${nestedReply.author.lastName}`
          }
        }))
      });

      // Enhance the response with better formatting
      const enhancedPost = {
        ...post,
        author: {
          ...post.author,
          fullName: `${post.author.firstName} ${post.author.lastName}`
        },
        replies: post.replies
          .filter(reply => !reply.parentReplyId) // Only top-level replies
          .map(reply => enhanceReply(reply))
      };

      res.status(200).json({
        success: true,
        data: enhancedPost
      });
    } catch (error: any) {
      console.error("Error fetching post:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Update post
  async updatePost(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, content, expiresAt, isNotified, category, isSolved } = req.body;
      const userId = req.user.id;

      // Check if post exists and user is author
      const existingPost = await prisma.post.findUnique({
        where: { id }
      });

      if (!existingPost) {
        res.status(404).json({
          success: false,
          message: "Post not found"
        });
        return;
      }

      if (existingPost.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only edit your own posts"
        });
        return;
      }

      // Validation
      if (!title || !content) {
        res.status(400).json({
          success: false,
          message: "Title and content are required"
        });
        return;
      }

      if (title.length > 200) {
        res.status(400).json({
          success: false,
          message: "Title must be less than 200 characters"
        });
        return;
      }

      // Update post
      const updatedPost = await prisma.post.update({
        where: { id },
        data: {
          title,
          content,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          isNotified: isNotified || false
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
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      const [existingExtras] = await attachPostExtras([existingPost]);
      const nextCategory =
        category !== undefined ? (category ? String(category).trim().slice(0, 64) : null) : existingExtras.category;
      const nextIsSolved = isSolved !== undefined ? Boolean(isSolved) : existingExtras.isSolved;
      if (nextCategory !== existingExtras.category || nextIsSolved !== existingExtras.isSolved) {
        await prisma.$executeRawUnsafe(
          `UPDATE posts SET category = ?, isSolved = ? WHERE id = ?`,
          nextCategory,
          nextIsSolved,
          id
        );
      }
      (updatedPost as any).category = nextCategory;
      (updatedPost as any).isSolved = nextIsSolved;

      // Log activity
      await prisma.userActivity.create({
        data: {
          userId: userId,
          action: 'post_updated',
          details: {
            postId: id,
            title: title
          }
        }
      });

      res.status(200).json({
        success: true,
        message: "Post updated successfully",
        data: updatedPost
      });
    } catch (error: any) {
      console.error("Error updating post:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Delete post
  async deletePost(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if post exists and user is author
      const existingPost = await prisma.post.findUnique({
        where: { id }
      });

      if (!existingPost) {
        res.status(404).json({
          success: false,
          message: "Post not found"
        });
        return;
      }

      if (existingPost.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only delete your own posts"
        });
        return;
      }

      // Delete post (cascade will delete replies)
      await prisma.post.delete({
        where: { id }
      });

      // Log activity
      await prisma.userActivity.create({
        data: {
          userId: userId,
          action: 'post_deleted',
          details: {
            postId: id,
            title: existingPost.title
          }
        }
      });

      res.status(200).json({
        success: true,
        message: "Post deleted successfully"
      });
    } catch (error: any) {
      console.error("Error deleting post:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Add reply to post
  async addReply(req: AuthRequest, res: Response) {
    try {
      const { postId } = req.params;
      const { content } = req.body;
      const authorId = req.user.id;

      // Validation
      if (!content) {
        res.status(400).json({
          success: false,
          message: "Content is required"
        });
        return;
      }

      // Check if post exists and is active
      const post = await prisma.post.findUnique({
        where: { id: postId }
      });

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Post not found"
        });
        return;
      }

      if (!post.isActive) {
        res.status(400).json({
          success: false,
          message: "Cannot reply to inactive post"
        });
        return;
      }

      // Create reply
      const reply = await prisma.reply.create({
        data: {
          content,
          postId,
          authorId
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
        }
      });

      // Log activity
      await prisma.userActivity.create({
        data: {
          userId: authorId,
          action: 'reply_created',
          details: {
            postId: postId,
            replyId: reply.id,
            content: content.substring(0, 100) // Log first 100 chars
          }
        }
      });

      res.status(201).json({
        success: true,
        message: "Reply added successfully",
        data: {
          id: reply.id,
          content: reply.content,
          postId: reply.postId,
          parentReplyId: reply.parentReplyId,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          author: {
            id: reply.author.id,
            firstName: reply.author.firstName,
            lastName: reply.author.lastName,
            email: reply.author.email,
            fullName: `${reply.author.firstName} ${reply.author.lastName}`
          }
        }
      });
    } catch (error: any) {
      console.error("Error adding reply:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Add reply to another reply (nested reply)
  async addReplyToReply(req: AuthRequest, res: Response) {
    try {
      const { replyId } = req.params;
      const { content } = req.body;
      const authorId = req.user.id;

      // Validation
      if (!content) {
        res.status(400).json({
          success: false,
          message: "Content is required"
        });
        return;
      }

      // Check if parent reply exists
      const parentReply = await prisma.reply.findUnique({
        where: { id: replyId },
        include: {
          post: true
        }
      });

      if (!parentReply) {
        res.status(404).json({
          success: false,
          message: "Parent reply not found"
        });
        return;
      }

      // Check if post is active
      if (!parentReply.post.isActive) {
        res.status(400).json({
          success: false,
          message: "Cannot reply to inactive post"
        });
        return;
      }

      // Create nested reply
      const reply = await prisma.reply.create({
        data: {
          content,
          postId: parentReply.postId,
          authorId,
          parentReplyId: replyId
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
          parentReply: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              }
            }
          }
        }
      });

      // Log activity
      await prisma.userActivity.create({
        data: {
          userId: authorId,
          action: 'nested_reply_created',
          details: {
            postId: parentReply.postId,
            parentReplyId: replyId,
            replyId: reply.id,
            content: content.substring(0, 100)
          }
        }
      });

      res.status(201).json({
        success: true,
        message: "Nested reply added successfully",
        data: {
          id: reply.id,
          content: reply.content,
          postId: reply.postId,
          parentReplyId: reply.parentReplyId,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
          author: {
            id: reply.author.id,
            firstName: reply.author.firstName,
            lastName: reply.author.lastName,
            email: reply.author.email,
            fullName: `${reply.author.firstName} ${reply.author.lastName}`
          },
          parentReply: reply.parentReply ? {
            id: reply.parentReply.id,
            content: reply.parentReply.content,
            author: {
              id: reply.parentReply.author.id,
              firstName: reply.parentReply.author.firstName,
              lastName: reply.parentReply.author.lastName,
              fullName: `${reply.parentReply.author.firstName} ${reply.parentReply.author.lastName}`
            }
          } : null
        }
      });
    } catch (error: any) {
      console.error("Error adding nested reply:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Update reply
  async updateReply(req: AuthRequest, res: Response) {
    try {
      const { replyId } = req.params;
      const { content } = req.body;
      const userId = req.user.id;

      // Check if reply exists and user is author
      const existingReply = await prisma.reply.findUnique({
        where: { id: replyId }
      });

      if (!existingReply) {
        res.status(404).json({
          success: false,
          message: "Reply not found"
        });
        return;
      }

      if (existingReply.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only edit your own replies"
        });
        return;
      }

      // Validation
      if (!content) {
        res.status(400).json({
          success: false,
          message: "Content is required"
        });
        return;
      }

      // Update reply
      const updatedReply = await prisma.reply.update({
        where: { id: replyId },
        data: { content },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      res.status(200).json({
        success: true,
        message: "Reply updated successfully",
        data: updatedReply
      });
    } catch (error: any) {
      console.error("Error updating reply:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Delete reply
  async deleteReply(req: AuthRequest, res: Response) {
    try {
      const { replyId } = req.params;
      const userId = req.user.id;

      // Check if reply exists and user is author
      const existingReply = await prisma.reply.findUnique({
        where: { id: replyId }
      });

      if (!existingReply) {
        res.status(404).json({
          success: false,
          message: "Reply not found"
        });
        return;
      }

      if (existingReply.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only delete your own replies"
        });
        return;
      }

      // Delete reply
      await prisma.reply.delete({
        where: { id: replyId }
      });

      res.status(200).json({
        success: true,
        message: "Reply deleted successfully"
      });
    } catch (error: any) {
      console.error("Error deleting reply:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}; 