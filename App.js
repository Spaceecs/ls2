import { Button, StatusBar, StyleSheet, View, Image, Text, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState, useEffect } from 'react';
import * as SQLite from 'expo-sqlite';

export default function App() {
  const [image, setImage] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [savedImages, setSavedImages] = useState([]);
  const [db, setDb] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    const openDb = async () => {
      try {
        const database = await SQLite.openDatabaseAsync('images.db');
        setDb(database);

        await database.execAsync(`
          CREATE TABLE IF NOT EXISTS images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            base64 TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await loadImagesFromDb(database);
      } catch (err) {
        console.error('DB error:', err);
      }
    };

    openDb();
  }, []);

  const loadImagesFromDb = async (database) => {
    try {
      const rows = await database.getAllAsync(
          'SELECT id, base64 FROM images ORDER BY id DESC'
      );

      if (rows.length > 0) {
        setSavedImages(rows);
        setImageBase64(rows[0].base64);
      } else {
        setSavedImages([]);
        setImageBase64(null);
      }
    } catch (err) {
      console.error('Load images error:', err);
    }
  };

  const handleOpenCamera = async () => {
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync();

    if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
      Alert.alert(
          'Permission required',
          'Sorry, we need camera and media permissions to proceed. Please enable them in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: true,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setImage(asset.uri);

      if (db) {
        try {
          await db.runAsync('INSERT INTO images (base64) VALUES (?);', [asset.base64]);
          await loadImagesFromDb(db);
          setImageBase64(asset.base64);
        } catch (err) {
          console.error('Save image error:', err);
          Alert.alert('Error', 'Failed to save image to database');
        }
      }
    }
  };

  const handleShowImage = (base64) => {
    setImageBase64(base64);
  };

  const handleUploadImage = async () => {
    if (!imageBase64) {
      Alert.alert('No image selected', 'Please pick an image from the list!');
      return;
    }

    const base64DataUrl = `data:image/jpeg;base64,${imageBase64}`;
    const formData = new FormData();
    formData.append('file', base64DataUrl);
    formData.append('upload_preset', 'my_images');

    try {
      const response = await fetch('https://api.cloudinary.com/v1_1/di5iqorka/image/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Upload failed:', data);
        Alert.alert('Upload failed', data?.error?.message || 'Unknown error');
        return;
      }

      if (data.secure_url) {
        setImageUrl(data.secure_url);
        await AsyncStorage.setItem('image', data.secure_url);
        Alert.alert('Success', 'Image uploaded successfully!');
      } else {
        console.error('Unexpected Cloudinary response:', data);
      }
    } catch (error) {
      console.error('Fetch error:', error.message);
      Alert.alert('Network error', error.message);
    }
  };


  return (
      <View style={styles.container}>
        <Button title="Open Camera" onPress={handleOpenCamera} />
        <Button title="Upload to Cloudinary" onPress={handleUploadImage} />

        {imageBase64 ? (
            <Image
                source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                style={styles.image}
            />
        ) : (
            <Text>No image loaded from database</Text>
        )}

        <Text style={styles.savedTitle}>Saved Images:</Text>
        {savedImages.map((img) => (
            <Button
                key={img.id}
                title={`Show Image ${img.id}`}
                onPress={() => handleShowImage(img.base64)}
            />
        ))}

        <StatusBar style="dark" />
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  image: {
    width: 300,
    height: 300,
    borderRadius: 10,
    marginVertical: 20,
  },
  savedTitle: {
    marginTop: 20,
    marginBottom: 10,
    fontWeight: 'bold',
  },
});
