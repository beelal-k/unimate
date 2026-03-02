// app/(tabs)/files.tsx
// Full file library screen with image preview, folder CRUD, document picker, move-to-folder

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, RefreshControl,
  Modal, Image, Dimensions, FlatList, TextInput as RNTextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  FolderOpen, Plus, FolderPlus, Upload, Trash2, Edit3, X,
  MoveRight, ChevronRight, Home, FolderInput, Eye, Share2,
  Search, ArrowDownAZ, CalendarDays,
} from 'lucide-react-native';

import { AnimatedScreen } from '../../components/ui/AnimatedScreen';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/Skeleton';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { FolderItem } from '../../components/files/FolderItem';
import { FileItem } from '../../components/files/FileItem';
import { BreadcrumbBar } from '../../components/files/BreadcrumbBar';
import { useFilesStore, type FileNode } from '../../lib/store/useFilesStore';
import { useToast } from '../../components/ui/Toast';
import { Springs } from '../../lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

function isImageFile(node: FileNode): boolean {
  if (!node.mimeType) return false;
  return node.mimeType.startsWith('image/');
}

export default function FilesScreen() {
  const {
    nodes, isLoading, currentFolderId, selectedIds, isSelecting,
    loadNodes, createFolder, uploadFile, renameNode, moveNode, deleteNode,
    deleteMultiple, setCurrentFolder, toggleSelection, clearSelection,
    getCurrentChildren, getBreadcrumbs,
  } = useFilesStore();

  const { showToast } = useToast();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showRenameSheet, setShowRenameSheet] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showFolderSheet, setShowFolderSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Search and Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('date');

  // File actions bottom sheet
  const [showActionsSheet, setShowActionsSheet] = useState(false);
  const [actionNode, setActionNode] = useState<FileNode | null>(null);

  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');

  // Move-to-folder state
  const [showMoveSheet, setShowMoveSheet] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [moveBrowseFolderId, setMoveBrowseFolderId] = useState<string | null>(null);

  const fabScale = useSharedValue(1);
  const fabStyle = useAnimatedStyle(() => ({ transform: [{ scale: fabScale.value }] }));

  const children = getCurrentChildren();
  const breadcrumbs = getBreadcrumbs();

  const filteredChildren = useMemo(() => {
    let result = children;
    
    // Search filtering
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase();
      // If we are searching, we want to search all nodes, not just the current folder.
      // But let's keep it to current folder for simplicity, or we could change this to search globally.
      // For now, doing current folder search:
      result = children.filter(node => node.name.toLowerCase().includes(lowerQuery));
    }
    
    // Sorting
    result = [...result].sort((a, b) => {
      // Folders always first
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    
    return result;
  }, [children, searchQuery, sortBy]);

  useEffect(() => { loadNodes(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNodes().catch(() => {});
    setRefreshing(false);
  }, []);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) {
      showToast('Enter a folder name', 'error');
      return;
    }
    try {
      await createFolder(newFolderName.trim(), currentFolderId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Folder created', 'success');
      setShowFolderSheet(false);
      setNewFolderName('');
    } catch {
      showToast('Failed to create folder', 'error');
    }
  }, [newFolderName, currentFolderId]);

  const handleUploadFile = useCallback(async () => {
    try {
      setShowAddSheet(false);
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      await uploadFile(
        asset.uri,
        asset.name,
        asset.mimeType || 'application/octet-stream',
        asset.size || 0,
        currentFolderId,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('File uploaded', 'success');
    } catch {
      showToast('Failed to upload file', 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [currentFolderId]);

  const handleOpenFile = useCallback(async (file: FileNode) => {
    if (!file.localUri) {
      showToast('File not available locally', 'error');
      return;
    }

    // Image preview
    if (isImageFile(file)) {
      setPreviewTitle(file.name);
      setPreviewImage(file.localUri);
      return;
    }

    // Other files — share
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.localUri, { dialogTitle: file.name });
      } else {
        showToast('Sharing not available on this device', 'error');
      }
    } catch {
      showToast('Failed to open file', 'error');
    }
  }, []);

  const handleRename = useCallback(async () => {
    if (!renameId || !renameValue.trim()) return;
    try {
      await renameNode(renameId, renameValue.trim());
      showToast('Renamed', 'success');
      setShowRenameSheet(false);
      setRenameId(null);
      setRenameValue('');
    } catch {
      showToast('Failed to rename', 'error');
    }
  }, [renameId, renameValue]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Delete Selected',
      `Delete ${selectedIds.size} item(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMultiple(Array.from(selectedIds));
              clearSelection();
              showToast('Deleted', 'success');
            } catch { showToast('Failed', 'error'); }
          },
        },
      ]
    );
  }, [selectedIds]);

  // Move flow
  const startMove = useCallback((nodeId: string) => {
    setMoveTargetId(nodeId);
    setMoveBrowseFolderId(currentFolderId);
    setShowMoveSheet(true);
    setShowActionsSheet(false);
  }, [currentFolderId]);

  const moveFolders = useMemo(() => {
    return nodes.filter(
      (n) => n.type === 'folder' && n.parentId === moveBrowseFolderId && n.id !== moveTargetId
    );
  }, [nodes, moveBrowseFolderId, moveTargetId]);

  const moveBreadcrumbs = useMemo(() => {
    const crumbs: { id: string; name: string }[] = [];
    let current = moveBrowseFolderId;
    while (current) {
      const node = nodes.find((n) => n.id === current);
      if (!node) break;
      crumbs.unshift({ id: node.id, name: node.name });
      current = node.parentId;
    }
    return crumbs;
  }, [nodes, moveBrowseFolderId]);

  const handleMoveHere = useCallback(async () => {
    if (!moveTargetId) return;
    try {
      await moveNode(moveTargetId, moveBrowseFolderId);
      showToast('Moved', 'success');
      setShowMoveSheet(false);
      setMoveTargetId(null);
    } catch {
      showToast('Failed to move', 'error');
    }
  }, [moveTargetId, moveBrowseFolderId]);

  // --- Item interactions ---
  const handleItemLongPress = useCallback((node: FileNode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionNode(node);
    setShowActionsSheet(true);
  }, []);

  const handleItemPress = useCallback(
    (node: FileNode) => {
      if (isSelecting) {
        toggleSelection(node.id);
        return;
      }
      if (node.type === 'folder') {
        setCurrentFolder(node.id);
      } else {
        handleOpenFile(node);
      }
    },
    [isSelecting, handleOpenFile]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
      <AnimatedScreen>
        <View style={{ flex: 1 }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
            }}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F3F3', borderRadius: 12, paddingHorizontal: 12, height: 44, marginRight: isSelecting ? 12 : 0 }}>
              <Search size={18} color="#A0A0A0" strokeWidth={2} />
              <RNTextInput
                placeholder="Search files..."
                placeholderTextColor="#A0A0A0"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{ flex: 1, height: 44, paddingHorizontal: 0, marginLeft: 8, fontSize: 15, fontFamily: 'Inter_400Regular', color: '#0A0A0A' }}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={10}>
                  <X size={16} color="#A0A0A0" />
                </Pressable>
              )}
            </View>
            {isSelecting && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => { const first = Array.from(selectedIds)[0]; if (first) startMove(first); }}
                  style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#E4E4E4', alignItems: 'center', justifyContent: 'center' }}
                >
                  <MoveRight size={18} color="#0A0A0A" strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={handleDeleteSelected}
                  style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={18} color="#FFFFFF" strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={clearSelection}
                  style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#E4E4E4', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} color="#0A0A0A" strokeWidth={1.8} />
                </Pressable>
              </View>
            )}
            
            {!isSelecting && (
              <Pressable
                onPress={() => setSortBy(prev => prev === 'name' ? 'date' : 'name')}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F3F3', alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}
              >
                {sortBy === 'name' ? (
                  <ArrowDownAZ size={20} color="#0A0A0A" strokeWidth={1.8} />
                ) : (
                  <CalendarDays size={20} color="#0A0A0A" strokeWidth={1.8} />
                )}
              </Pressable>
            )}
          </View>

          {/* Breadcrumbs */}
          {(breadcrumbs.length > 0 || currentFolderId !== null) && (
            <BreadcrumbBar breadcrumbs={breadcrumbs} onNavigate={setCurrentFolder} />
          )}

          {/* Content */}
          {isLoading ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}><SkeletonList count={5} /></View>
          ) : filteredChildren.length === 0 ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 108 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A0A0A" />}
            >
              <EmptyState
                icon={searchQuery ? <Search size={64} color="#A0A0A0" strokeWidth={1.2} /> : <FolderOpen size={64} color="#A0A0A0" strokeWidth={1.2} />}
                title={searchQuery ? 'No results found' : currentFolderId ? 'Empty folder' : 'No files yet'}
                description={searchQuery ? `No files matching "${searchQuery}"` : currentFolderId ? 'Upload files or create subfolders.' : 'Upload PDFs, documents, and lecture slides.'}
                actionLabel={searchQuery ? 'Clear Search' : 'Upload File'}
                onAction={searchQuery ? () => setSearchQuery('') : handleUploadFile}
              />
            </ScrollView>
          ) : (
            <FlatList
              data={filteredChildren}
              keyExtractor={(node) => node.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 108 }}
              showsVerticalScrollIndicator={false}
              initialNumToRender={15}
              windowSize={5}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0A0A0A" />}
              renderItem={({ item: node, index }) => 
                node.type === 'folder' ? (
                  <FolderItem folder={node} onPress={() => handleItemPress(node)} onLongPress={() => handleItemLongPress(node)} isSelected={selectedIds.has(node.id)} index={index} />
                ) : (
                  <FileItem file={node} onPress={() => handleItemPress(node)} onLongPress={() => handleItemLongPress(node)} isSelected={selectedIds.has(node.id)} index={index} />
                )
              }
            />
          )}

          {/* FAB */}
          {!isSelecting && (
            <AnimatedPressable
              onPressIn={() => { fabScale.value = withSpring(0.88, Springs.snappy); }}
              onPressOut={() => { fabScale.value = withSpring(1, Springs.snappy); }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddSheet(true); }}
              style={[{ position: 'absolute', bottom: 108, right: 20, width: 56, height: 56, borderRadius: 16, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }, fabStyle]}
            >
              <Plus size={24} color="#FFFFFF" strokeWidth={2} />
            </AnimatedPressable>
          )}

          {/* Add Sheet */}
          <BottomSheet visible={showAddSheet} onDismiss={() => setShowAddSheet(false)} snapPoint={0.3}>
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginBottom: 8 }}>Add to Files</Text>
              <Button title="Upload File" onPress={handleUploadFile} variant="secondary" fullWidth icon={<Upload size={18} color="#0A0A0A" strokeWidth={1.8} />} />
              <Button title="New Folder" onPress={() => { setShowAddSheet(false); setTimeout(() => setShowFolderSheet(true), 300); }} variant="secondary" fullWidth icon={<FolderPlus size={18} color="#0A0A0A" strokeWidth={1.8} />} />
            </View>
          </BottomSheet>

          {/* New Folder Sheet */}
          <BottomSheet visible={showFolderSheet} onDismiss={() => setShowFolderSheet(false)} snapPoint={0.35}>
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>New Folder</Text>
              <Input label="Folder Name" value={newFolderName} onChangeText={setNewFolderName} autoFocus />
              <Button title="Create" onPress={handleCreateFolder} fullWidth />
            </View>
          </BottomSheet>

          {/* Rename Sheet */}
          <BottomSheet visible={showRenameSheet} onDismiss={() => setShowRenameSheet(false)} snapPoint={0.35}>
            <View style={{ gap: 16 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Rename</Text>
              <Input label="New Name" value={renameValue} onChangeText={setRenameValue} autoFocus />
              <Button title="Save" onPress={handleRename} fullWidth />
            </View>
          </BottomSheet>

          {/* File Actions Sheet (replaces Alert.alert) */}
          <BottomSheet visible={showActionsSheet} onDismiss={() => { setShowActionsSheet(false); setActionNode(null); }} snapPoint={0.35}>
            {actionNode && (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A', marginBottom: 8 }} numberOfLines={1}>
                  {actionNode.name}
                </Text>
                {isImageFile(actionNode) && (
                  <Button
                    title="Preview"
                    variant="secondary"
                    fullWidth
                    icon={<Eye size={18} color="#0A0A0A" strokeWidth={1.8} />}
                    onPress={() => {
                      setShowActionsSheet(false);
                      if (actionNode.localUri) {
                        setPreviewTitle(actionNode.name);
                        setPreviewImage(actionNode.localUri);
                      }
                    }}
                  />
                )}
                <Button
                  title="Rename"
                  variant="secondary"
                  fullWidth
                  icon={<Edit3 size={18} color="#0A0A0A" strokeWidth={1.8} />}
                  onPress={() => {
                    setShowActionsSheet(false);
                    setRenameId(actionNode.id);
                    setRenameValue(actionNode.name);
                    setTimeout(() => setShowRenameSheet(true), 300);
                  }}
                />
                <Button
                  title="Move"
                  variant="secondary"
                  fullWidth
                  icon={<MoveRight size={18} color="#0A0A0A" strokeWidth={1.8} />}
                  onPress={() => startMove(actionNode.id)}
                />
                {actionNode.localUri && (
                  <Button
                    title="Share"
                    variant="secondary"
                    fullWidth
                    icon={<Share2 size={18} color="#0A0A0A" strokeWidth={1.8} />}
                    onPress={async () => {
                      setShowActionsSheet(false);
                      const canShare = await Sharing.isAvailableAsync();
                      if (canShare) await Sharing.shareAsync(actionNode.localUri!, { dialogTitle: actionNode.name });
                    }}
                  />
                )}
                <Button
                  title="Delete"
                  variant="secondary"
                  fullWidth
                  icon={<Trash2 size={18} color="#EF4444" strokeWidth={1.8} />}
                  onPress={() => {
                    setShowActionsSheet(false);
                    Alert.alert('Delete?', `Delete "${actionNode.name}"?`, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete', style: 'destructive',
                        onPress: async () => {
                          try {
                            await deleteNode(actionNode.id);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            showToast('Deleted', 'success');
                          } catch { showToast('Failed', 'error'); }
                        },
                      },
                    ]);
                  }}
                />
              </View>
            )}
          </BottomSheet>

          {/* Move-to Sheet */}
          <BottomSheet visible={showMoveSheet} onDismiss={() => { setShowMoveSheet(false); setMoveTargetId(null); }} snapPoint={0.55}>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FolderInput size={20} color="#0A0A0A" strokeWidth={1.8} />
                <Text style={{ fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#0A0A0A' }}>Move to…</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, alignItems: 'center', paddingVertical: 4 }}>
                <Pressable onPress={() => setMoveBrowseFolderId(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Home size={14} color={moveBrowseFolderId === null ? '#0A0A0A' : '#A0A0A0'} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: moveBrowseFolderId === null ? '#0A0A0A' : '#A0A0A0' }}>Root</Text>
                </Pressable>
                {moveBreadcrumbs.map((crumb) => (
                  <View key={crumb.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <ChevronRight size={12} color="#D0D0D0" strokeWidth={2} />
                    <Pressable onPress={() => setMoveBrowseFolderId(crumb.id)}>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: crumb.id === moveBrowseFolderId ? '#0A0A0A' : '#A0A0A0' }}>{crumb.name}</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
              <View style={{ borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 8 }}>
                {moveFolders.length === 0 ? (
                  <Text style={{ fontSize: 13, fontFamily: 'Inter_400Regular', color: '#A0A0A0', textAlign: 'center', paddingVertical: 16 }}>No subfolders here</Text>
                ) : (
                  moveFolders.map((folder) => (
                    <Pressable key={folder.id} onPress={() => setMoveBrowseFolderId(folder.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
                      <FolderOpen size={20} color="#6E6E6E" strokeWidth={1.6} />
                      <Text style={{ flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium', color: '#0A0A0A' }}>{folder.name}</Text>
                      <ChevronRight size={16} color="#D0D0D0" strokeWidth={2} />
                    </Pressable>
                  ))
                )}
              </View>
              <Button title="Move Here" onPress={handleMoveHere} fullWidth />
            </View>
          </BottomSheet>

          {/* Image Preview Modal */}
          <Modal
            visible={!!previewImage}
            transparent
            animationType="fade"
            onRequestClose={() => setPreviewImage(null)}
          >
            <Pressable
              onPress={() => setPreviewImage(null)}
              style={{
                flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {/* Close button */}
              <Pressable
                onPress={() => setPreviewImage(null)}
                style={{
                  position: 'absolute', top: 60, right: 20, zIndex: 10,
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={20} color="#FFFFFF" strokeWidth={2} />
              </Pressable>

              {/* Title */}
              <Text style={{
                position: 'absolute', top: 68, left: 20, right: 70,
                fontSize: 14, fontFamily: 'Inter_500Medium', color: '#FFFFFF',
              }} numberOfLines={1}>
                {previewTitle}
              </Text>

              {/* Image */}
              {previewImage && (
                <Image
                  source={{ uri: previewImage }}
                  style={{
                    width: SCREEN_WIDTH - 32,
                    height: SCREEN_HEIGHT * 0.7,
                  }}
                  resizeMode="contain"
                />
              )}
            </Pressable>
          </Modal>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  );
}
