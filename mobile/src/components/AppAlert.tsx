import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';

export interface AppAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  visible: boolean;
}

const initialState: AlertState = {
  title: '',
  message: undefined,
  buttons: [],
  visible: false,
};

let alertListenerRef: ((state: AlertState) => void) | null = null;

export const AppAlert = {
  alert(title: string, message?: string, buttons?: AppAlertButton[]) {
    const finalButtons = buttons ?? [{ text: 'OK' }];
    if (alertListenerRef) {
      alertListenerRef({
        title,
        message,
        buttons: finalButtons,
        visible: true,
      });
    }
  },
};

export function AppAlertProvider() {
  const [state, setState] = useState<AlertState>(initialState);

  useEffect(() => {
    alertListenerRef = setState;
    return () => {
      alertListenerRef = null;
    };
  }, []);

  const handleDismiss = () => {
    // A single-button alert has only one possible outcome, so backdrop-tap
    // confirms it regardless of style. With multiple buttons, backdrop-tap
    // only takes an action if one of them is explicitly the cancel option.
    if (state.buttons.length === 1) {
      state.buttons[0].onPress?.();
    } else {
      state.buttons.find((b) => b.style === 'cancel')?.onPress?.();
    }
    setState(initialState);
  };

  const handleButtonPress = (button: AppAlertButton) => {
    if (button.onPress) {
      button.onPress();
    }
    setState(initialState);
  };

  const isMultipleButtons = state.buttons.length > 2;

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.backdrop} onPress={handleDismiss}>
        <Pressable
          style={styles.cardContainer}
          onPress={() => {}}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.card}>
            <Text style={styles.title}>{state.title}</Text>
            {state.message && <Text style={styles.message}>{state.message}</Text>}

            <View
              style={[
                styles.buttonsContainer,
                isMultipleButtons && styles.buttonsContainerStacked,
              ]}
            >
              {state.buttons.map((button, index) => {
                const isDestructive = button.style === 'destructive';
                const isCancel = button.style === 'cancel';
                const isLastButton = index === state.buttons.length - 1;
                const isBold = isLastButton && !isMultipleButtons;

                return (
                  <Pressable
                    key={index}
                    style={[
                      styles.button,
                      isMultipleButtons && styles.buttonStacked,
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isDestructive && styles.buttonTextDestructive,
                        isCancel && styles.buttonTextCancel,
                        !isDestructive && !isCancel && styles.buttonTextDefault,
                        isBold && styles.buttonTextBold,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    minWidth: 270,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  buttonsContainerStacked: {
    flexDirection: 'column',
    gap: 8,
  },
  button: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    flex: 1,
  },
  buttonStacked: {
    flex: 1,
    minHeight: 44,
  },
  buttonText: {
    fontSize: 15,
    textAlign: 'center',
  },
  buttonTextDefault: {
    color: '#2563eb',
    fontWeight: '600',
  },
  buttonTextCancel: {
    color: '#64748b',
    fontWeight: '500',
  },
  buttonTextDestructive: {
    color: '#dc2626',
    fontWeight: '600',
  },
  buttonTextBold: {
    fontWeight: '700',
  },
});
