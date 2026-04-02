export const companyProfileEndpoints = {
  "/api/company-profile": {
    get: {
      summary: "Get company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Company profile retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/CompanyProfile" }
                }
              }
            }
          }
        }
      }
    },
    post: {
      summary: "Create company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateCompanyProfileRequest" }
          }
        }
      },
      responses: {
        201: { description: "Company profile created successfully" },
        400: { description: "Bad request" }
      }
    },
    put: {
      summary: "Update company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateCompanyProfileRequest" }
          }
        }
      },
      responses: { 200: { description: "Company profile updated successfully" } }
    },
    delete: {
      summary: "Delete company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Company profile deleted successfully" } }
    }
  },

  "/api/company-profile/upsert": {
    post: {
      summary: "Create or update company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateCompanyProfileRequest" }
          }
        }
      },
      responses: { 200: { description: "Company profile upserted successfully" } }
    }
  },

  "/api/company-profile/logo": {
    post: {
      summary: "Upload company logo",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["logo"],
              properties: {
                logo: { type: "string", format: "binary" }
              }
            }
          }
        }
      },
      responses: { 200: { description: "Logo uploaded and saved" } }
    }
  },

  "/api/company-profile/addresses": {
    get: {
      summary: "List all letterhead addresses",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Addresses retrieved",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/CompanyProfileAddress" }
                  }
                }
              }
            }
          }
        }
      }
    },
    post: {
      summary: "Create a letterhead address (with optional logo)",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["line1"],
              properties: {
                logo: { type: "string", format: "binary" },
                label: { type: "string" },
                line1: { type: "string" },
                line2: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
                isActive: { type: "string", enum: ["true", "false"] }
              }
            }
          }
        }
      },
      responses: { 201: { description: "Address created" } }
    }
  },

  "/api/company-profile/addresses/{id}": {
    put: {
      summary: "Update a letterhead address (with optional new logo)",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                logo: { type: "string", format: "binary" },
                label: { type: "string" },
                line1: { type: "string" },
                line2: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
                isActive: { type: "string", enum: ["true", "false"] }
              }
            }
          }
        }
      },
      responses: { 200: { description: "Address updated" }, 404: { description: "Address not found" } }
    },
    delete: {
      summary: "Delete a letterhead address",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Address deleted" }, 404: { description: "Address not found" } }
    }
  },

  "/api/company-profile/addresses/{id}/set-active": {
    post: {
      summary: "Set an address as the active (letterhead) address",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Active address updated" }, 404: { description: "Address not found" } }
    }
  }
};

export const companyProfileEndpoints = {
  "/api/company-profile": {
    get: {
      summary: "Get company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Company profile retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: { $ref: "#/components/schemas/CompanyProfile" }
                }
              }
            }
          }
        }
      }
    },
    post: {
      summary: "Create company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateCompanyProfileRequest" }
          }
        }
      },
      responses: {
        201: { description: "Company profile created successfully" },
        400: { description: "Bad request" }
      }
    },
    put: {
      summary: "Update company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateCompanyProfileRequest" }
          }
        }
      },
      responses: { 200: { description: "Company profile updated successfully" } }
    },
    delete: {
      summary: "Delete company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Company profile deleted successfully" } }
    }
  },

  "/api/company-profile/upsert": {
    post: {
      summary: "Create or update company profile",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CreateCompanyProfileRequest" }
          }
        }
      },
      responses: { 200: { description: "Company profile upserted successfully" } }
    }
  },

  "/api/company-profile/logo": {
    post: {
      summary: "Upload company logo",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["logo"],
              properties: {
                logo: { type: "string", format: "binary" }
              }
            }
          }
        }
      },
      responses: { 200: { description: "Logo uploaded and saved" } }
    }
  },

  "/api/company-profile/addresses": {
    get: {
      summary: "List all letterhead addresses",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Addresses retrieved",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/CompanyProfileAddress" }
                  }
                }
              }
            }
          }
        }
      }
    },
    post: {
      summary: "Create a letterhead address (with optional logo)",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["line1"],
              properties: {
                logo: { type: "string", format: "binary" },
                label: { type: "string" },
                line1: { type: "string" },
                line2: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
                isActive: { type: "string", enum: ["true", "false"] }
              }
            }
          }
        }
      },
      responses: { 201: { description: "Address created" } }
    }
  },

  "/api/company-profile/addresses/{id}": {
    put: {
      summary: "Update a letterhead address (with optional new logo)",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                logo: { type: "string", format: "binary" },
                label: { type: "string" },
                line1: { type: "string" },
                line2: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
                isActive: { type: "string", enum: ["true", "false"] }
              }
            }
          }
        }
      },
      responses: { 200: { description: "Address updated" }, 404: { description: "Address not found" } }
    },
    delete: {
      summary: "Delete a letterhead address",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Address deleted" }, 404: { description: "Address not found" } }
    }
  },

  "/api/company-profile/addresses/{id}/set-active": {
    post: {
      summary: "Set an address as the active (letterhead) address",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Active address updated" }, 404: { description: "Address not found" } }
    }
  }
};

