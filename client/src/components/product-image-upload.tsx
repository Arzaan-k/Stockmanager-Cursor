import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { api } from '@/lib/api';
import { Upload, X, Image as ImageIcon, Link, Loader2, Trash2, RotateCcw } from 'lucide-react';

interface ProductImageUploadProps {
  productId: string;
  productName: string;
}

interface ProductImage {
  url: string;
  filename: string;
  uploadedAt: string;
}

export function ProductImageUpload({ productId, productName }: ProductImageUploadProps) {
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const { toast } = useToast();

  // Get product images
  const { data: images, isLoading: imagesLoading } = useQuery({
    queryKey: [`/api/products/${productId}/images`],
    queryFn: () => api.getProductImages(productId).then(res => res.json()),
  });

  // Upload from file mutation
  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const res = await api.uploadProductImage(productId, file);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload image');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Image uploaded successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/images`] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/image-recognition/status'] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to upload image', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Upload from URL mutation
  const uploadFromUrlMutation = useMutation({
    mutationFn: (url: string) => api.uploadProductImageFromUrl(productId, url).then(res => res.json()),
    onSuccess: () => {
      toast({ title: 'Image uploaded from URL successfully' });
      setImageUrl('');
      setIsUrlDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/images`] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/image-recognition/status'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to upload image from URL', 
        description: error?.message || 'An error occurred',
        variant: 'destructive' 
      });
    },
  });

  // Delete image mutation
  const deleteImageMutation = useMutation({
    mutationFn: (imageUrl: string) => api.deleteProductImage(productId, imageUrl).then(res => res.json()),
    onSuccess: () => {
      toast({ title: 'Image deleted successfully' });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/images`] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/image-recognition/status'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete image', 
        description: error?.message || 'An error occurred',
        variant: 'destructive' 
      });
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({ 
          title: 'File too large', 
          description: 'Please select an image smaller than 10MB',
          variant: 'destructive' 
        });
        return;
      }
      uploadImageMutation.mutate(file);
    }
  }, [uploadImageMutation, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    multiple: false,
    disabled: uploadImageMutation.isPending
  });

  const handleUrlUpload = () => {
    if (!imageUrl.trim()) {
      toast({ title: 'Please enter an image URL', variant: 'destructive' });
      return;
    }
    uploadFromUrlMutation.mutate(imageUrl.trim());
  };

  const handleDeleteImage = (imageUrlToDelete: string, imageName?: string) => {
    const confirmMessage = imageName 
      ? `Are you sure you want to delete ${imageName}?`
      : 'Are you sure you want to delete this image?';
    
    if (confirm(confirmMessage)) {
      deleteImageMutation.mutate(imageUrlToDelete);
    }
  };

  const handleReplaceImage = (oldImageUrl: string) => {
    // Create a hidden file input to select the new image
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        // Validate file size
        if (file.size > 10 * 1024 * 1024) {
          toast({ 
            title: 'File too large', 
            description: 'Please select an image smaller than 10MB',
            variant: 'destructive' 
          });
          return;
        }
        
        try {
          // Delete the old image first
          await api.deleteProductImage(productId, oldImageUrl).then(res => res.json());
          
          // Upload the new image
          uploadImageMutation.mutate(file);
        } catch (error) {
          toast({ 
            title: 'Failed to replace image', 
            description: 'Could not remove old image',
            variant: 'destructive' 
          });
        }
      }
    };
    fileInput.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Product Images</h4>
        <Dialog open={isUrlDialogOpen} onOpenChange={setIsUrlDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Link className="w-4 h-4 mr-2" />
              Add from URL
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Image from URL</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input
                  id="imageUrl"
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsUrlDialogOpen(false);
                    setImageUrl('');
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUrlUpload}
                  disabled={uploadFromUrlMutation.isPending}
                >
                  {uploadFromUrlMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Upload'
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current Images */}
      {imagesLoading ? (
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading images...</span>
        </div>
      ) : images && images.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {images.map((image: ProductImage, index: number) => (
            <div key={index} className="relative group">
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="aspect-square relative">
                    <img
                      src={image.url}
                      alt={`${productName} - Image ${index + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/placeholder-image.svg';
                      }}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleReplaceImage(image.url)}
                        disabled={deleteImageMutation.isPending || uploadImageMutation.isPending}
                        title="Replace Image"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteImage(image.url, image.filename)}
                        disabled={deleteImageMutation.isPending}
                        title="Delete Image"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No images uploaded yet</div>
      )}

      {/* Upload Area */}
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer
              transition-colors hover:border-muted-foreground/50
              ${isDragActive ? 'border-primary bg-primary/5' : ''}
              ${uploadImageMutation.isPending ? 'cursor-not-allowed opacity-50' : ''}
            `}
          >
            <input {...getInputProps()} />
            
            {uploadImageMutation.isPending ? (
              <div className="space-y-2">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                <div className="text-sm font-medium">Uploading image...</div>
                <div className="text-xs text-muted-foreground">
                  Please wait while we process your image
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-center">
                  {isDragActive ? (
                    <Upload className="w-8 h-8 text-primary" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div className="text-sm font-medium">
                  {isDragActive
                    ? 'Drop the image here'
                    : 'Drag & drop an image here, or click to select'
                  }
                </div>
                <div className="text-xs text-muted-foreground">
                  Supports: JPEG, PNG, GIF, WebP (Max 10MB)
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
