-- Create Images table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Images')
BEGIN
    CREATE TABLE Images (
        id INT IDENTITY(1,1) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        description NVARCHAR(MAX),
        category NVARCHAR(100) NOT NULL DEFAULT 'unbuilt', -- Default to 'unbuilt'
        project_id INT NULL, -- Reference to a project
        image_data VARBINARY(MAX) NOT NULL, -- Binary image data
        content_type NVARCHAR(100) NOT NULL, -- Store the MIME type
        uploadDate DATETIME DEFAULT GETDATE(),
        isActive BIT DEFAULT 1
    );
    
    -- Add constraint to limit images per project
    ALTER TABLE Images ADD CONSTRAINT CHK_MaxImagesPerProject
    CHECK (
        (SELECT COUNT(*) FROM Images i WHERE i.project_id = Images.project_id AND i.isActive = 1) <= 5
    );
    
    PRINT 'Images table created successfully';
END
ELSE
BEGIN
    -- Add new columns if they don't exist
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Images') AND name = 'image_data')
    BEGIN
        ALTER TABLE Images ADD image_data VARBINARY(MAX);
        PRINT 'Added image_data column';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Images') AND name = 'content_type')
    BEGIN
        ALTER TABLE Images ADD content_type NVARCHAR(100);
        PRINT 'Added content_type column';
    END
    
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Images') AND name = 'project_id')
    BEGIN
        ALTER TABLE Images ADD project_id INT NULL;
        PRINT 'Added project_id column';
    END
    
    -- Update category column to NOT NULL with default value if it exists
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Images') AND name = 'category')
    BEGIN
        ALTER TABLE Images ALTER COLUMN category NVARCHAR(100) NOT NULL;
        PRINT 'Modified category column';
    END
    
    -- Add constraint if it doesn't exist
    IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE object_id = OBJECT_ID('CHK_MaxImagesPerProject'))
    BEGIN
        ALTER TABLE Images ADD CONSTRAINT CHK_MaxImagesPerProject
        CHECK (
            (SELECT COUNT(*) FROM Images i WHERE i.project_id = Images.project_id AND i.isActive = 1) <= 5
        );
        PRINT 'Added max images per project constraint';
    END
    
    PRINT 'Images table updated successfully';
END